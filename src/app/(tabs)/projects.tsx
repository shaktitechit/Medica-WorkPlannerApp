import { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '@/components/AppHeader';
import { Screen, Card, Loading } from '@/components/ui';
import { useGetProjectsQuery } from '@/store/api/projectApiSlice';
import { useSession } from '@/lib/session';
import { isWpElevated } from '@/utils/roles';
import { useThemeColors } from '@/theme';
import type { Project, ProjectStatus } from '@/types/project';

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; bg: string; text: string; border: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  draft: { label: 'Draft', bg: '#64748b15', text: '#64748b', border: '#64748b30', icon: 'document-outline' },
  planning: { label: 'Planning', bg: '#6366f115', text: '#6366f1', border: '#6366f130', icon: 'calendar-outline' },
  active: { label: 'In Progress', bg: '#2563eb15', text: '#2563eb', border: '#2563eb30', icon: 'play-circle-outline' },
  on_hold: { label: 'On Hold', bg: '#d9770615', text: '#d97706', border: '#d9770630', icon: 'pause-circle-outline' },
  completed: { label: 'Completed', bg: '#10b98115', text: '#10b981', border: '#10b98130', icon: 'checkmark-circle-outline' },
  closed: { label: 'Closed', bg: '#8b5cf615', text: '#8b5cf6', border: '#8b5cf630', icon: 'lock-closed-outline' },
  cancelled: { label: 'Cancelled', bg: '#ef444415', text: '#ef4444', border: '#ef444430', icon: 'close-circle-outline' },
};

const PRIORITY_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  urgent: { label: 'Urgent', bg: '#ef444420', text: '#ef4444' },
  high: { label: 'High', bg: '#f9731620', text: '#f97316' },
  medium: { label: 'Medium', bg: '#3b82f620', text: '#3b82f6' },
  low: { label: 'Low', bg: '#64748b20', text: '#64748b' },
};

export default function ProjectsTabScreen() {
  const colors = useThemeColors();
  const { session } = useSession();
  const user = session?.user;
  const canCreate = isWpElevated(user);

  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch, isFetching } = useGetProjectsQuery({
    status: selectedStatus === 'all' ? undefined : selectedStatus,
    search: search.trim() || undefined,
  });

  const projects = data?.items || [];

  // Compute live system metrics
  const stats = useMemo(() => {
    const total = projects.length;
    const active = projects.filter((p) => p.status === 'active').length;
    const planning = projects.filter((p) => p.status === 'planning').length;
    const completed = projects.filter((p) => p.status === 'completed').length;
    const closed = projects.filter((p) => p.status === 'closed').length;
    return { total, active, planning, completed, closed };
  }, [projects]);

  const renderProjectItem = ({ item }: { item: Project }) => {
    const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.planning;
    const priorityCfg = PRIORITY_CONFIG[item.priority || 'medium'] || PRIORITY_CONFIG.medium;
    const managerName =
      typeof item.project_manager_id === 'object' && item.project_manager_id
        ? item.project_manager_id.name
        : 'Unassigned';

    const assignedTeams = item.assigned_team_ids || [];
    const membersCount = item.members?.length || 0;
    const progress = Math.min(Math.max(item.progress_percentage || 0, 0), 100);

    return (
      <Pressable
        onPress={() => router.push({ pathname: '/project/[id]', params: { id: item._id } } as any)}
        style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1, marginBottom: 12 }]}
      >
        <Card style={styles.projectCard}>
          {/* Card Top Row: Code + Priority + Status */}
          <View style={styles.cardTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
              <View style={[styles.codeBadge, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                <Ionicons name="layers-outline" size={11} color={colors.primary} />
                <Text style={[styles.codeText, { color: colors.text }]}>{item.project_code || 'PRJ'}</Text>
              </View>

              {item.category && (
                <View style={[styles.categoryBadge, { backgroundColor: colors.cardAlt }]}>
                  <Text style={[styles.categoryText, { color: colors.muted }]}>{item.category}</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {item.priority && item.priority !== 'medium' && (
                <View style={[styles.priorityBadge, { backgroundColor: priorityCfg.bg }]}>
                  <Text style={[styles.priorityText, { color: priorityCfg.text }]}>{priorityCfg.label}</Text>
                </View>
              )}

              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusCfg.bg, borderColor: statusCfg.border },
                ]}
              >
                <Ionicons name={statusCfg.icon} size={11} color={statusCfg.text} />
                <Text style={[styles.statusText, { color: statusCfg.text }]}>{statusCfg.label}</Text>
              </View>
            </View>
          </View>

          {/* Project Title & Description */}
          <Text style={[styles.titleText, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>

          {item.description ? (
            <Text style={[styles.descText, { color: colors.muted }]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}

          {/* Progress Bar & Roadmap Step Gauge */}
          <View style={styles.progressContainer}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: colors.muted }]}>
                {item.completed_steps || 0}/{item.total_steps || 0} Steps Complete
              </Text>
              <Text style={[styles.progressValue, { color: colors.primary }]}>{progress}%</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.cardAlt }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: progress === 100 ? '#10b981' : colors.primary,
                    width: `${progress}%`,
                  },
                ]}
              />
            </View>
          </View>

          {/* Assigned Teams Chips (if any) */}
          {assignedTeams.length > 0 && (
            <View style={styles.teamsRow}>
              <Ionicons name="people-outline" size={12} color={colors.muted} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {assignedTeams.map((tm, idx) => (
                    <View key={idx} style={[styles.teamChipMini, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                      <Text style={[styles.teamChipMiniText, { color: colors.text }]}>{tm}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Footer Metadata & CTA */}
          <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
            <View style={styles.metaItem}>
              <Ionicons name="person-circle-outline" size={14} color={colors.primary} />
              <Text style={[styles.metaText, { color: colors.muted }]} numberOfLines={1}>
                {managerName}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Ionicons name="chatbubbles-outline" size={13} color={colors.muted} />
              <Text style={[styles.metaText, { color: colors.muted }]}>
                {membersCount} {membersCount === 1 ? 'member' : 'members'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={[styles.ctaText, { color: colors.primary }]}>Workspace</Text>
              <Ionicons name="chevron-forward" size={12} color={colors.primary} />
            </View>
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <Screen scroll={false}>
      <AppHeader title="Projects System" />

      {/* Top Header Row with System Title & Action */}
      <View style={styles.topHeaderWrap}>
        <View>
          <Text style={[styles.screenHeading, { color: colors.text }]}>Projects & Collaborative System</Text>
          <Text style={[styles.screenSubheading, { color: colors.muted }]}>
            Sequential workflow roadmap, live chat rooms & team operations
          </Text>
        </View>
        {canCreate && (
          <Pressable
            onPress={() => router.push('/project/create' as any)}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.addBtnText}>New Project</Text>
          </Pressable>
        )}
      </View>

      {/* KPI Metrics Strip */}
      <View style={styles.kpiContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.kpiScroll}>
          <Pressable
            onPress={() => setSelectedStatus('all')}
            style={[
              styles.kpiCard,
              { backgroundColor: selectedStatus === 'all' ? colors.primary + '15' : colors.card, borderColor: selectedStatus === 'all' ? colors.primary : colors.border },
            ]}
          >
            <Text style={[styles.kpiVal, { color: selectedStatus === 'all' ? colors.primary : colors.text }]}>{stats.total}</Text>
            <Text style={[styles.kpiLabel, { color: colors.muted }]}>Total Projects</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedStatus('active')}
            style={[
              styles.kpiCard,
              { backgroundColor: selectedStatus === 'active' ? '#2563eb15' : colors.card, borderColor: selectedStatus === 'active' ? '#2563eb' : colors.border },
            ]}
          >
            <Text style={[styles.kpiVal, { color: '#2563eb' }]}>{stats.active}</Text>
            <Text style={[styles.kpiLabel, { color: colors.muted }]}>In Progress</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedStatus('planning')}
            style={[
              styles.kpiCard,
              { backgroundColor: selectedStatus === 'planning' ? '#6366f115' : colors.card, borderColor: selectedStatus === 'planning' ? '#6366f1' : colors.border },
            ]}
          >
            <Text style={[styles.kpiVal, { color: '#6366f1' }]}>{stats.planning}</Text>
            <Text style={[styles.kpiLabel, { color: colors.muted }]}>Planning</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedStatus('completed')}
            style={[
              styles.kpiCard,
              { backgroundColor: selectedStatus === 'completed' ? '#10b98115' : colors.card, borderColor: selectedStatus === 'completed' ? '#10b981' : colors.border },
            ]}
          >
            <Text style={[styles.kpiVal, { color: '#10b981' }]}>{stats.completed}</Text>
            <Text style={[styles.kpiLabel, { color: colors.muted }]}>Completed</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedStatus('closed')}
            style={[
              styles.kpiCard,
              { backgroundColor: selectedStatus === 'closed' ? '#8b5cf615' : colors.card, borderColor: selectedStatus === 'closed' ? '#8b5cf6' : colors.border },
            ]}
          >
            <Text style={[styles.kpiVal, { color: '#8b5cf6' }]}>{stats.closed}</Text>
            <Text style={[styles.kpiLabel, { color: colors.muted }]}>Closed</Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* Search Input Bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by title, code, category..."
          placeholderTextColor={colors.muted}
          style={[styles.searchInput, { color: colors.text }]}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Filter Tabs Horizontal Bar */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {[
            { key: 'all', label: 'ALL' },
            { key: 'active', label: 'IN PROGRESS' },
            { key: 'planning', label: 'PLANNING' },
            { key: 'completed', label: 'COMPLETED' },
            { key: 'closed', label: 'CLOSED' },
            { key: 'on_hold', label: 'ON HOLD' },
          ].map((st) => {
            const isActive = selectedStatus === st.key;
            return (
              <Pressable
                key={st.key}
                onPress={() => setSelectedStatus(st.key)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: isActive ? colors.primary : colors.card,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text style={[styles.filterPillText, { color: isActive ? '#fff' : colors.muted }]}>
                  {st.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Projects List View */}
      {isLoading ? (
        <Loading label="Loading projects system…" />
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item._id}
          renderItem={renderProjectItem}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrap, { backgroundColor: colors.cardAlt }]}>
                <Ionicons name="briefcase-outline" size={36} color={colors.muted} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Projects Found</Text>
              <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                {search
                  ? 'No projects matching your search query.'
                  : 'Collaborative projects and execution roadmaps will appear here.'}
              </Text>
              {canCreate && (
                <Pressable
                  onPress={() => router.push('/project/create' as any)}
                  style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.emptyActionBtnText}>Create New Project</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topHeaderWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  screenHeading: {
    fontSize: 15,
    fontWeight: '800',
  },
  screenSubheading: {
    fontSize: 11,
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 4,
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  kpiContainer: {
    marginBottom: 8,
  },
  kpiScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  kpiCard: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 88,
    alignItems: 'center',
  },
  kpiVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  filterRow: {
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  projectCard: {
    borderRadius: 16,
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  codeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: '600',
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    gap: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  titleText: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
    lineHeight: 18,
  },
  descText: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  progressContainer: {
    marginVertical: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressValue: {
    fontSize: 11,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  teamChipMini: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  teamChipMiniText: {
    fontSize: 9,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '40%',
  },
  metaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  ctaText: {
    fontSize: 11,
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 8,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
    marginTop: 8,
  },
  emptyActionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
