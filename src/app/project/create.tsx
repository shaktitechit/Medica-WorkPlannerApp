import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  StyleSheet,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '@/components/AppHeader';
import { Screen, Card, Button } from '@/components/ui';
import { useCreateProjectMutation, useGetEligibleMembersQuery } from '@/store/api/projectApiSlice';
import { useThemeColors } from '@/theme';
import type { ProjectPriority, ProjectStatus, ProjectMemberRole } from '@/types/project';

const CATEGORY_OPTIONS = [
  'Operations',
  'Client Project',
  'Internal Initiative',
  'Audit / Compliance',
  'IT / Tech',
  'Marketing',
  'Finance',
  'HR / Admin',
  'Other',
];

const PRIORITY_OPTIONS: Array<{ key: ProjectPriority; label: string; color: string; bg: string }> = [
  { key: 'critical', label: 'Urgent', color: '#ef4444', bg: '#ef444420' },
  { key: 'high', label: 'High', color: '#f97316', bg: '#f9731620' },
  { key: 'medium', label: 'Medium', color: '#3b82f6', bg: '#3b82f620' },
  { key: 'low', label: 'Low', color: '#64748b', bg: '#64748b20' },
];

const STATUS_OPTIONS: Array<{ key: ProjectStatus; label: string; color: string }> = [
  { key: 'planning', label: 'Planning', color: '#6366f1' },
  { key: 'active', label: 'In Progress', color: '#2563eb' },
  { key: 'on_hold', label: 'On Hold', color: '#d97706' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
  { key: 'closed', label: 'Closed', color: '#8b5cf6' },
  { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
  { key: 'draft', label: 'Draft', color: '#64748b' },
];

const ROLE_OPTIONS: Array<{ value: ProjectMemberRole; label: string }> = [
  { value: 'admin', label: 'Admin (Full Access)' },
  { value: 'lead', label: 'Project Lead' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'viewer', label: 'Viewer' },
];

const PHASE_OPTIONS = ['Planning', 'Execution', 'Review', 'Deployment', 'Closure', 'Custom'];

interface SelectedMember {
  user_id: string;
  user_name: string;
  user_email?: string;
  role: ProjectMemberRole;
}

interface StepDraft {
  title: string;
  phase_name: string;
  due_date?: string;
}

export default function CreateProjectScreen() {
  const colors = useThemeColors();
  const [createProjectMutation, { isLoading }] = useCreateProjectMutation();
  const { data: eligibleData } = useGetEligibleMembersQuery();

  // Basic Information
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Operations');
  const [priority, setPriority] = useState<ProjectPriority>('medium');
  const [status, setStatus] = useState<ProjectStatus>('planning');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [targetEndDate, setTargetEndDate] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Project Manager & Teams
  const [projectManagerId, setProjectManagerId] = useState('');
  const [pmSearchQuery, setPmSearchQuery] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [customTeamInput, setCustomTeamInput] = useState('');

  // Assigned Members Roster
  const [assignedMembers, setAssignedMembers] = useState<SelectedMember[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedMemberUserId, setSelectedMemberUserId] = useState('');
  const [selectedMemberRole, setSelectedMemberRole] = useState<ProjectMemberRole>('contributor');

  // Dynamic Initial Steps Pipeline
  const [steps, setSteps] = useState<StepDraft[]>([
    { title: 'Project Kickoff & Requirements Analysis', phase_name: 'Planning', due_date: '' },
    { title: 'Execution & Deliverables Implementation', phase_name: 'Execution', due_date: '' },
    { title: 'Final Quality Review & Sign-off', phase_name: 'Review', due_date: '' },
  ]);

  const eligibleUsers = eligibleData?.users || [];
  const availableTeams = eligibleData?.teams || [];

  // PM Filtered List
  const filteredPmUsers = eligibleUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(pmSearchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(pmSearchQuery.toLowerCase()) ||
      (u.department && u.department.toLowerCase().includes(pmSearchQuery.toLowerCase()))
  );

  // Member Picker Filtered List
  const filteredCandidateMembers = eligibleUsers.filter(
    (u) =>
      !assignedMembers.some((m) => m.user_id === u._id) &&
      (u.name.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
        (u.department && u.department.toLowerCase().includes(memberSearchQuery.toLowerCase())))
  );

  const toggleTeam = (team: string) => {
    setSelectedTeams((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]
    );
  };

  const handleAddCustomTeam = () => {
    const trimmed = customTeamInput.trim();
    if (!trimmed) return;
    if (!selectedTeams.includes(trimmed)) {
      setSelectedTeams((prev) => [...prev, trimmed]);
    }
    setCustomTeamInput('');
  };

  const handleAddMemberToRoster = () => {
    if (!selectedMemberUserId) return;
    const user = eligibleUsers.find((u) => u._id === selectedMemberUserId);
    if (!user) return;

    if (assignedMembers.some((m) => m.user_id === user._id)) {
      Alert.alert('Notice', 'User is already added to member roster');
      return;
    }

    setAssignedMembers((prev) => [
      ...prev,
      {
        user_id: user._id,
        user_name: user.name,
        user_email: user.email,
        role: selectedMemberRole,
      },
    ]);
    setSelectedMemberUserId('');
    setSelectedMemberRole('contributor');
    setMemberSearchQuery('');
  };

  const handleRemoveMember = (userId: string) => {
    setAssignedMembers((prev) => prev.filter((m) => m.user_id !== userId));
  };

  const handleMemberRoleChange = (userId: string, newRole: ProjectMemberRole) => {
    setAssignedMembers((prev) =>
      prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m))
    );
  };

  // Steps handling
  const handleAddStep = () => {
    setSteps((prev) => [...prev, { title: '', phase_name: 'Execution', due_date: '' }]);
  };

  const handleRemoveStep = (idx: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleStepChange = (idx: number, field: keyof StepDraft, value: string) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Project title is required');
      return;
    }

    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const initialSteps = steps
        .filter((s) => s.title.trim())
        .map((s, idx) => ({
          step_number: idx + 1,
          title: s.title.trim(),
          phase_name: s.phase_name || 'Execution',
          due_date: s.due_date ? new Date(s.due_date).toISOString() : undefined,
        }));

      await createProjectMutation({
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        status,
        start_date: startDate ? (new Date(startDate).toISOString() as any) : undefined,
        target_end_date: targetEndDate ? (new Date(targetEndDate).toISOString() as any) : undefined,
        tags: parsedTags,
        project_manager_id: projectManagerId || undefined,
        assigned_team_ids: selectedTeams,
        members: assignedMembers.map((m) => ({
          user_id: m.user_id as any,
          user_name: m.user_name,
          user_email: m.user_email,
          role: m.role,
        })),
        steps: initialSteps,
      }).unwrap();

      Alert.alert('Success', 'Project created successfully!', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/projects' as any) },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || 'Failed to create project');
    }
  };

  return (
    <Screen scroll={false}>
      <AppHeader title="Create Project" showBack />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* SECTION 1: BASIC INFORMATION */}
        <Card style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="folder-open" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Project Information</Text>
          </View>

          {/* Title */}
          <Text style={[styles.fieldLabel, { color: colors.muted }]}>PROJECT TITLE *</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Q4 Client Rollout & Compliance Audit"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
          />

          {/* Description */}
          <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 12 }]}>DESCRIPTION</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Detailed objectives, scope of work, and expected deliverables..."
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
          />

          {/* Category */}
          <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 12 }]}>CATEGORY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              {CATEGORY_OPTIONS.map((cat) => {
                const isSelected = category === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategory(cat)}
                    style={[
                      styles.choicePill,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.cardAlt,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 11, fontWeight: '700' }}>
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Priority */}
          <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 12 }]}>PRIORITY</Text>
          <View style={styles.pillRow}>
            {PRIORITY_OPTIONS.map((p) => {
              const isSelected = priority === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setPriority(p.key)}
                  style={[
                    styles.choicePill,
                    {
                      backgroundColor: isSelected ? p.color : colors.cardAlt,
                      borderColor: isSelected ? p.color : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 11, fontWeight: '700' }}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Initial Status */}
          <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 12 }]}>INITIAL STATUS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              {STATUS_OPTIONS.map((st) => {
                const isSelected = status === st.key;
                return (
                  <Pressable
                    key={st.key}
                    onPress={() => setStatus(st.key)}
                    style={[
                      styles.choicePill,
                      {
                        backgroundColor: isSelected ? st.color : colors.cardAlt,
                        borderColor: isSelected ? st.color : colors.border,
                      },
                    ]}
                  >
                    <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 11, fontWeight: '700' }}>
                      {st.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Timeline Dates */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>START DATE (YYYY-MM-DD)</Text>
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                placeholder="2026-10-01"
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>TARGET END DATE</Text>
              <TextInput
                value={targetEndDate}
                onChangeText={setTargetEndDate}
                placeholder="2026-11-30"
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
              />
            </View>
          </View>

          {/* Tags */}
          <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 12 }]}>TAGS (COMMA SEPARATED)</Text>
          <TextInput
            value={tagsInput}
            onChangeText={setTagsInput}
            placeholder="e.g. Audit, Urgent, ISO, 2026"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
          />
        </Card>

        {/* SECTION 2: PROJECT MANAGER / LEAD */}
        <Card style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="person-circle" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Project Manager / Lead</Text>
          </View>
          <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
            Assign primary accountable lead for execution and approvals
          </Text>

          {/* Search PM */}
          <View style={[styles.miniSearch, { borderColor: colors.border, backgroundColor: colors.cardAlt }]}>
            <Ionicons name="search" size={14} color={colors.muted} />
            <TextInput
              value={pmSearchQuery}
              onChangeText={setPmSearchQuery}
              placeholder="Search user by name, email, department..."
              placeholderTextColor={colors.muted}
              style={[styles.miniSearchInput, { color: colors.text }]}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {filteredPmUsers.slice(0, 15).map((u) => {
                const isSelected = projectManagerId === u._id;
                return (
                  <Pressable
                    key={u._id}
                    onPress={() => setProjectManagerId(isSelected ? '' : u._id)}
                    style={[
                      styles.userSelectChip,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.cardAlt,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="person" size={13} color={isSelected ? '#fff' : colors.primary} />
                    <View>
                      <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 11, fontWeight: '700' }}>
                        {u.name}
                      </Text>
                      {u.department ? (
                        <Text style={{ color: isSelected ? '#ffffffcc' : colors.muted, fontSize: 9 }}>
                          {u.department}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Card>

        {/* SECTION 3: ASSIGNED DEPARTMENTS / TEAMS */}
        <Card style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="business" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Assigned Departments & Teams</Text>
          </View>
          <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
            Department members receive live project visibility and updates
          </Text>

          <View style={[styles.pillRow, { marginTop: 8 }]}>
            {availableTeams.map((team) => {
              const isSelected = selectedTeams.includes(team);
              return (
                <Pressable
                  key={team}
                  onPress={() => toggleTeam(team)}
                  style={[
                    styles.teamPill,
                    {
                      backgroundColor: isSelected ? colors.primary : colors.cardAlt,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Ionicons name="people" size={12} color={isSelected ? '#fff' : colors.primary} />
                  <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 11, fontWeight: '700' }}>
                    {team}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Quick Add Custom Team */}
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            <TextInput
              value={customTeamInput}
              onChangeText={setCustomTeamInput}
              placeholder="Add custom team/group name..."
              placeholderTextColor={colors.muted}
              style={[styles.input, { flex: 1, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
            />
            <Pressable
              onPress={handleAddCustomTeam}
              style={[styles.miniBtn, { backgroundColor: colors.primary }]}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Add</Text>
            </Pressable>
          </View>
        </Card>

        {/* SECTION 4: ASSIGNED MEMBERS ROSTER */}
        <Card style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="people-circle" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Team Members Roster ({assignedMembers.length})
            </Text>
          </View>
          <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
            Add individual members with specific permissions & roles
          </Text>

          {/* Member candidate search */}
          <View style={[styles.miniSearch, { borderColor: colors.border, backgroundColor: colors.cardAlt, marginTop: 8 }]}>
            <Ionicons name="search" size={14} color={colors.muted} />
            <TextInput
              value={memberSearchQuery}
              onChangeText={setMemberSearchQuery}
              placeholder="Search user to add..."
              placeholderTextColor={colors.muted}
              style={[styles.miniSearchInput, { color: colors.text }]}
            />
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {filteredCandidateMembers.slice(0, 15).map((u) => {
                const isChosen = selectedMemberUserId === u._id;
                return (
                  <Pressable
                    key={u._id}
                    onPress={() => setSelectedMemberUserId(isChosen ? '' : u._id)}
                    style={[
                      styles.userSelectChip,
                      {
                        backgroundColor: isChosen ? colors.primary + '25' : colors.cardAlt,
                        borderColor: isChosen ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="person-add" size={13} color={colors.primary} />
                    <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{u.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Role selector & Add Button */}
          {selectedMemberUserId ? (
            <View style={[styles.addMemberBlock, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>SELECT MEMBER ROLE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.pillRow}>
                  {ROLE_OPTIONS.map((r) => {
                    const isSelected = selectedMemberRole === r.value;
                    return (
                      <Pressable
                        key={r.value}
                        onPress={() => setSelectedMemberRole(r.value)}
                        style={[
                          styles.rolePill,
                          {
                            backgroundColor: isSelected ? colors.primary : colors.card,
                            borderColor: isSelected ? colors.primary : colors.border,
                          },
                        ]}
                      >
                        <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 10, fontWeight: '700' }}>
                          {r.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              <Pressable
                onPress={handleAddMemberToRoster}
                style={[styles.addMemberSubmitBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="checkmark-circle" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Confirm Add Member</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Added Members List */}
          {assignedMembers.length > 0 && (
            <View style={{ marginTop: 12, gap: 6 }}>
              {assignedMembers.map((m) => (
                <View
                  key={m.user_id}
                  style={[styles.memberRosterCard, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberRosterName, { color: colors.text }]}>{m.user_name}</Text>
                    {m.user_email ? (
                      <Text style={[styles.memberRosterEmail, { color: colors.muted }]}>{m.user_email}</Text>
                    ) : null}
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.roleTag, { backgroundColor: colors.primary + '18' }]}>
                      <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>
                        {m.role.toUpperCase()}
                      </Text>
                    </View>
                    <Pressable onPress={() => handleRemoveMember(m.user_id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* SECTION 5: INITIAL ACTION STEPS PIPELINE */}
        <Card style={styles.cardSection}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="git-merge" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Action Steps Roadmap</Text>
          </View>
          <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
            Pre-configure sequential milestone steps for team execution
          </Text>

          <View style={{ marginTop: 10, gap: 10 }}>
            {steps.map((step, idx) => (
              <View
                key={idx}
                style={[styles.stepCardDraft, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
              >
                <View style={styles.stepTopRow}>
                  <View style={[styles.stepNumberBadge, { backgroundColor: colors.primary }]}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>{idx + 1}</Text>
                  </View>

                  {/* Phase selector */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1, marginHorizontal: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {PHASE_OPTIONS.map((ph) => {
                        const isPh = step.phase_name === ph;
                        return (
                          <Pressable
                            key={ph}
                            onPress={() => handleStepChange(idx, 'phase_name', ph)}
                            style={[
                              styles.miniPhaseChip,
                              {
                                backgroundColor: isPh ? colors.primary : colors.card,
                                borderColor: isPh ? colors.primary : colors.border,
                              },
                            ]}
                          >
                            <Text style={{ color: isPh ? '#fff' : colors.muted, fontSize: 9, fontWeight: '700' }}>
                              {ph}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {steps.length > 1 && (
                    <Pressable onPress={() => handleRemoveStep(idx)} hitSlop={6}>
                      <Ionicons name="close-circle" size={18} color={colors.danger} />
                    </Pressable>
                  )}
                </View>

                {/* Step Title */}
                <TextInput
                  value={step.title}
                  onChangeText={(val) => handleStepChange(idx, 'title', val)}
                  placeholder={`Step ${idx + 1} action title...`}
                  placeholderTextColor={colors.muted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                />
              </View>
            ))}

            <Pressable
              onPress={handleAddStep}
              style={[styles.addStepDashedBtn, { borderColor: colors.primary, backgroundColor: colors.cardAlt }]}
            >
              <Ionicons name="add-circle" size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '800' }}>Add Another Step</Text>
            </Pressable>
          </View>
        </Card>

        {/* SUBMIT BUTTON */}
        <Button
          label={isLoading ? 'Creating Project System…' : 'Create Project System'}
          onPress={handleCreate}
          disabled={isLoading}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardSection: {
    marginBottom: 14,
    borderRadius: 16,
    padding: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 15,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    height: 72,
    textAlignVertical: 'top',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  choicePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  teamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  miniSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 36,
    gap: 6,
  },
  miniSearchInput: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 0,
  },
  userSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  miniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
  },
  addMemberBlock: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  addMemberSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    gap: 6,
  },
  memberRosterCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  memberRosterName: {
    fontSize: 12,
    fontWeight: '700',
  },
  memberRosterEmail: {
    fontSize: 10,
    marginTop: 1,
  },
  roleTag: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stepCardDraft: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  stepTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepNumberBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPhaseChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  addStepDashedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 6,
  },
});
