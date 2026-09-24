import { useEffect, useMemo, useState } from "react";
import { personId } from "@/lib/dates";
import { useSession } from "@/lib/session";
import { useGetUsersQuery } from "@/store/api/authApiSlice";
import { useGetMyTeamQuery, useGetTeamTreeQuery } from "@/store/api/workPlannerApiSlice";
import { canReceiveWorkPlan, isWpAdmin, isWpElevated, isWpManager } from "@/utils/roles";

export type ScopePerson = { _id: string; name?: string; email?: string };
export type TeamOption = { _id: string; name: string; memberIds: string[] };

type Named = { _id?: string; id?: string; name?: string; email?: string };

function asPeople(rows: Named[]) {
  const people: ScopePerson[] = [];
  for (const user of rows) {
    const id = String(user._id || user.id || "");
    if (id) people.push({ _id: id, name: user.name, email: user.email });
  }
  return people;
}

export function useTeamScope(initialScope: "mine" | "team" = "mine") {
  const { session } = useSession();
  const selfId = personId(session?.user);
  const admin = isWpAdmin(session?.user);
  const manager = isWpManager(session?.user);
  const elevated = isWpElevated(session?.user);
  const [scope, setScope] = useState<"mine" | "team">(initialScope);
  useEffect(() => {
    if (!session?.user || elevated) return;
    setScope("mine");
  }, [session?.user, elevated]);
  const [teamId, setTeamId] = useState("all");
  const [memberId, setMemberId] = useState("all");
  const users = useGetUsersQuery(undefined, { skip: !admin });
  const tree = useGetTeamTreeQuery(undefined, { skip: !admin });
  const myTeam = useGetMyTeamQuery(undefined, { skip: !elevated || admin });

  const teams = useMemo(() => {
    if (!elevated) return [] as TeamOption[];
    if (admin) {
      const managers = (tree.data?.managers || []) as Array<Named & { report_ids?: string[] }>;
      return managers
        .map((item) => {
          const id = String(item._id || item.id || "");
          return {
            _id: id,
            name: `${item.name || "Manager"}'s team`,
            memberIds: [id, ...(item.report_ids || []).map(String)].filter(Boolean),
          };
        })
        .filter((item) => item._id);
    }
    if (!manager || !selfId) return [] as TeamOption[];
    const members = (myTeam.data?.members || []) as Named[];
    return [
      {
        _id: selfId,
        name: `${session?.user?.name || "Me"} (My reporting team)`,
        memberIds: [selfId, ...members.map((item) => String(item._id || item.id || ""))].filter(Boolean),
      },
    ];
  }, [admin, elevated, manager, tree.data, myTeam.data, selfId, session?.user?.name]);

  const people = useMemo(() => {
    const directory = new Map<string, ScopePerson>();
    const add = (person: ScopePerson) => {
      if (person._id && !directory.has(person._id)) directory.set(person._id, person);
    };
    if (selfId) add({ _id: selfId, name: session?.user?.name || "Me", email: session?.user?.email });
    if (admin) {
      for (const user of (users.data || []).filter((item) => canReceiveWorkPlan(item, selfId))) add({ _id: String(user._id), name: user.name, email: user.email });
      for (const user of asPeople((tree.data?.users || []) as Named[])) add(user);
    } else {
      for (const user of asPeople((myTeam.data?.members || []) as Named[])) add(user);
    }
    const selected = teamId === "all" ? null : teams.find((team) => team._id === teamId);
    const list = selected
      ? selected.memberIds.map((id) => directory.get(id) || { _id: id, name: id })
      : [...directory.values()];
    list.sort((a, b) => (a._id === selfId ? -1 : b._id === selfId ? 1 : (a.name || "").localeCompare(b.name || "")));
    return [{ _id: "all", name: admin ? "All executives" : "All team members" }, ...list];
  }, [admin, users.data, tree.data, myTeam.data, teams, teamId, selfId, session?.user]);

  const teamChoices = useMemo(
    () => [{ _id: "all", name: "All teams" }, ...teams.map((team) => ({ _id: team._id, name: team.name }))],
    [teams],
  );

  function showMine() {
    setScope("mine");
    setMemberId("all");
  }

  function pickTeam(id: string) {
    setTeamId(id);
    setMemberId("all");
  }

  function allows(userId: string) {
    if (!elevated) return true;
    if (scope === "mine") return !userId || userId === selfId;
    if (teamId !== "all") {
      const team = teams.find((item) => item._id === teamId);
      if (team && userId && !team.memberIds.includes(userId)) return false;
    }
    if (memberId !== "all" && userId && userId !== memberId) return false;
    return true;
  }

  return {
    admin,
    manager,
    elevated,
    selfId,
    scope,
    teamId,
    memberId,
    setScope,
    setMemberId,
    showMine,
    pickTeam,
    teams,
    teamChoices,
    people,
    allows,
  };
}
