import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
  ActivityIndicator,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppHeader } from '@/components/AppHeader';
import { Screen, Card, Button, Loading } from '@/components/ui';
import {
  useGetProjectByIdQuery,
  useUpdateProjectMutation,
  useUpdateStepStatusMutation,
  useToggleChecklistItemMutation,
  useAddWorkflowActionMutation,
  useUpdateWorkflowActionMutation,
  useDeleteWorkflowActionMutation,
  useCloseProjectMutation,
  useReopenProjectMutation,
  useDeleteProjectMutation,
  useGetProjectMessagesQuery,
  usePostProjectMessageMutation,
  useGetProjectFilesQuery,
  useUploadProjectFileMutation,
  useDeleteProjectFileMutation,
  useGetEligibleMembersQuery,
  useAddProjectMemberMutation,
  useUpdateProjectMemberRoleMutation,
  useRemoveProjectMemberMutation,
  useAssignProjectTeamsMutation,
  useRemoveProjectTeamMutation,
} from '@/store/api/projectApiSlice';
import { resolvePublicAssetUrl, getAttachmentPreviewUrl, getAttachmentDownloadUrl } from '@/lib/env';
import { useSession } from '@/lib/session';
import { isWpElevated } from '@/utils/roles';
import { useThemeColors } from '@/theme';
import type {
  ActionStepStatus,
  ProjectMemberRole,
  WorkflowActionStatus,
  ProjectPriority,
  ProjectStatus,
} from '@/types/project';

const EDIT_CATEGORY_OPTIONS = [
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

const EDIT_PRIORITY_OPTIONS: Array<{ key: ProjectPriority; label: string; color: string }> = [
  { key: 'critical', label: 'Urgent', color: '#ef4444' },
  { key: 'high', label: 'High', color: '#f97316' },
  { key: 'medium', label: 'Medium', color: '#3b82f6' },
  { key: 'low', label: 'Low', color: '#64748b' },
];

const EDIT_STATUS_OPTIONS: Array<{ key: ProjectStatus; label: string; color: string }> = [
  { key: 'planning', label: 'Planning', color: '#6366f1' },
  { key: 'active', label: 'In Progress', color: '#2563eb' },
  { key: 'on_hold', label: 'On Hold', color: '#d97706' },
  { key: 'completed', label: 'Completed', color: '#10b981' },
  { key: 'closed', label: 'Closed', color: '#8b5cf6' },
  { key: 'cancelled', label: 'Cancelled', color: '#ef4444' },
  { key: 'draft', label: 'Draft', color: '#64748b' },
];

const EDIT_ROLE_OPTIONS: Array<{ value: ProjectMemberRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'lead', label: 'Lead' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'viewer', label: 'Viewer' },
];

export default function ProjectWorkspaceDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = String(id || '');
  const colors = useThemeColors();
  const { session } = useSession();
  const user = session?.user;
  const currentUserId = user?._id || '';
  const canAdmin = isWpElevated(user);

  const [activeTab, setActiveTab] = useState<'steps' | 'chat' | 'files' | 'overview'>('steps');
  const [chatInput, setChatInput] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [closureRemarks, setClosureRemarks] = useState('');

  // Chat Attachment & File Preview State
  const [selectedChatFile, setSelectedChatFile] = useState<{
    uri: string;
    name: string;
    type: string;
    size?: number;
  } | null>(null);
  const [isUploadingChatFile, setIsUploadingChatFile] = useState(false);
  const [previewImageModal, setPreviewImageModal] = useState<{
    url: string;
    title: string;
  } | null>(null);
  const [isUploadingTabFile, setIsUploadingTabFile] = useState(false);

  // Workflow Plan drawer in Chat
  const [isChatWorkflowDrawerOpen, setIsChatWorkflowDrawerOpen] = useState(false);

  // Edit Project Modal State (Full Web Parity)
  const [isEditProjectModalOpen, setIsEditProjectModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('Operations');
  const [editPriority, setEditPriority] = useState<ProjectPriority>('medium');
  const [editStatus, setEditStatus] = useState<ProjectStatus>('active');
  const [editStartDate, setEditStartDate] = useState('');
  const [editTargetEndDate, setEditTargetEndDate] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editPmId, setEditPmId] = useState('');
  const [editPmSearch, setEditPmSearch] = useState('');
  const [editSelectedTeams, setEditSelectedTeams] = useState<string[]>([]);
  const [editCustomTeamInput, setEditCustomTeamInput] = useState('');
  const [editMembers, setEditMembers] = useState<
    Array<{ user_id: string; user_name: string; user_email?: string; role: ProjectMemberRole }>
  >([]);
  const [editMemberSearch, setEditMemberSearch] = useState('');
  const [editSelectedMemberId, setEditSelectedMemberId] = useState('');
  const [editSelectedMemberRole, setEditSelectedMemberRole] = useState<ProjectMemberRole>('contributor');

  // Add Workflow Action Modal State
  const [isAddActionModalOpen, setIsAddActionModalOpen] = useState(false);
  const [targetStepIdForAction, setTargetStepIdForAction] = useState<string | null>(null);
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newActionDesc, setNewActionDesc] = useState('');

  // Workflow Transition Confirmation Modal State
  const [transitionModal, setTransitionModal] = useState<{
    isOpen: boolean;
    targetType: 'step' | 'action';
    stepId: string;
    stepNumber?: number;
    actionId?: string;
    itemTitle: string;
    currentStatus: string;
    targetStatus: string;
  } | null>(null);
  const [transitionRemarks, setTransitionRemarks] = useState('');
  const [isExecutingTransition, setIsExecutingTransition] = useState(false);

  // Team & Member Modals
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isAssignTeamModalOpen, setIsAssignTeamModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<ProjectMemberRole>('contributor');
  const [userSearchText, setUserSearchText] = useState('');
  const [teamNameInput, setTeamNameInput] = useState('');

  const { data: project, isLoading, refetch } = useGetProjectByIdQuery(projectId, { skip: !projectId });
  const { data: messagesData } = useGetProjectMessagesQuery(
    { projectId },
    { skip: !projectId || activeTab !== 'chat', pollingInterval: 3500 }
  );
  const { data: files } = useGetProjectFilesQuery(projectId, { skip: !projectId || activeTab !== 'files' });
  const { data: eligibleData } = useGetEligibleMembersQuery(undefined, {
    skip: !isAddMemberModalOpen && !isAssignTeamModalOpen && !isEditProjectModalOpen,
  });

  const [updateProject] = useUpdateProjectMutation();
  const [updateStatus] = useUpdateStepStatusMutation();
  const [toggleChecklist] = useToggleChecklistItemMutation();
  const [addWorkflowAction] = useAddWorkflowActionMutation();
  const [updateWorkflowAction] = useUpdateWorkflowActionMutation();
  const [deleteWorkflowAction] = useDeleteWorkflowActionMutation();
  const [closeProject] = useCloseProjectMutation();
  const [reopenProject] = useReopenProjectMutation();
  const [deleteProject] = useDeleteProjectMutation();
  const [isExecutingClose, setIsExecutingClose] = useState(false);
  const [postMessage] = usePostProjectMessageMutation();
  const [uploadProjectFile] = useUploadProjectFileMutation();
  const [deleteProjectFile] = useDeleteProjectFileMutation();
  const [addMember] = useAddProjectMemberMutation();
  const [removeMember] = useRemoveProjectMemberMutation();
  const [assignTeams] = useAssignProjectTeamsMutation();
  const [removeTeam] = useRemoveProjectTeamMutation();

  const isClosed = project?.status === 'closed' || project?.status === 'completed';

  const handleOpenEditProject = () => {
    if (!project) return;
    setEditTitle(project.title || '');
    setEditDesc(project.description || '');
    setEditCategory(project.category || 'Operations');
    setEditPriority(project.priority || 'medium');
    setEditStatus(project.status || 'active');
    setEditStartDate(project.start_date ? new Date(project.start_date).toISOString().split('T')[0] : '');
    setEditTargetEndDate(project.target_end_date ? new Date(project.target_end_date).toISOString().split('T')[0] : '');
    setEditTags((project.tags || []).join(', '));
    const pmId =
      typeof project.project_manager_id === 'object' && project.project_manager_id
        ? project.project_manager_id._id
        : (project.project_manager_id as string) || '';
    setEditPmId(pmId);
    setEditSelectedTeams(project.assigned_team_ids || []);
    const initialMembers = (project.members || []).map((m) => ({
      user_id: typeof m.user_id === 'object' && m.user_id ? m.user_id._id : (m.user_id as string),
      user_name: typeof m.user_id === 'object' && m.user_id?.name ? m.user_id.name : m.user_name || 'Member',
      user_email: typeof m.user_id === 'object' && m.user_id?.email ? m.user_id.email : m.user_email || '',
      role: m.role || 'contributor',
    }));
    setEditMembers(initialMembers);
    setIsEditProjectModalOpen(true);
  };

  const handleSaveProjectEdit = async () => {
    if (!editTitle.trim()) {
      Alert.alert('Required', 'Project title is required');
      return;
    }
    try {
      const parsedTags = editTags.split(',').map((t) => t.trim()).filter(Boolean);
      await updateProject({
        id: projectId,
        title: editTitle.trim(),
        description: editDesc.trim(),
        category: editCategory,
        priority: editPriority,
        status: editStatus,
        start_date: editStartDate ? (new Date(editStartDate).toISOString() as any) : undefined,
        target_end_date: editTargetEndDate ? (new Date(editTargetEndDate).toISOString() as any) : undefined,
        tags: parsedTags,
        project_manager_id: editPmId || undefined,
        assigned_team_ids: editSelectedTeams,
        members: editMembers.map((m) => ({
          user_id: m.user_id as any,
          user_name: m.user_name,
          user_email: m.user_email,
          role: m.role,
        })),
      }).unwrap();
      setIsEditProjectModalOpen(false);
      refetch();
      Alert.alert('Success', 'Project updated successfully.');
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || 'Failed to update project');
    }
  };

  const openStepTransition = (
    step: { _id: string; title: string; step_number?: number; status: string },
    targetStatus: ActionStepStatus
  ) => {
    setTransitionModal({
      isOpen: true,
      targetType: 'step',
      stepId: step._id,
      stepNumber: step.step_number,
      itemTitle: step.title,
      currentStatus: step.status,
      targetStatus,
    });
    setTransitionRemarks('');
  };

  const openActionTransition = (
    step: { _id: string; step_number?: number },
    action: { _id?: string; title: string; status: string },
    targetStatus: WorkflowActionStatus
  ) => {
    setTransitionModal({
      isOpen: true,
      targetType: 'action',
      stepId: step._id,
      stepNumber: step.step_number,
      actionId: action._id,
      itemTitle: action.title,
      currentStatus: action.status,
      targetStatus,
    });
    setTransitionRemarks('');
  };

  const handleConfirmTransition = async () => {
    if (!transitionModal) return;
    if (transitionModal.targetStatus === 'blocked' && !transitionRemarks.trim()) {
      Alert.alert('Required', 'Please enter a blocker explanation / remark');
      return;
    }
    try {
      setIsExecutingTransition(true);
      if (transitionModal.targetType === 'step') {
        await updateStatus({
          projectId,
          stepId: transitionModal.stepId,
          status: transitionModal.targetStatus as ActionStepStatus,
          remark: transitionRemarks.trim() || undefined,
        }).unwrap();
      } else if (transitionModal.targetType === 'action' && transitionModal.actionId) {
        await updateWorkflowAction({
          projectId,
          stepId: transitionModal.stepId,
          actionId: transitionModal.actionId,
          status: transitionModal.targetStatus,
          remarks: transitionRemarks.trim() || undefined,
        }).unwrap();
      }
      setTransitionModal(null);
      setTransitionRemarks('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || 'Failed to update status');
    } finally {
      setIsExecutingTransition(false);
    }
  };

  const handleToggleChecklist = async (stepId: string, itemId: string, currentVal: boolean) => {
    try {
      await toggleChecklist({ projectId, stepId, checklistItemId: itemId, is_completed: !currentVal }).unwrap();
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || 'Failed to update checklist item');
    }
  };

  // Workflow sub-action handlers
  const handleOpenAddActionModal = (stepId: string) => {
    setTargetStepIdForAction(stepId);
    setNewActionTitle('');
    setNewActionDesc('');
    setIsAddActionModalOpen(true);
  };

  const handleSaveNewAction = async () => {
    if (!targetStepIdForAction || !newActionTitle.trim()) {
      Alert.alert('Required', 'Action title is required');
      return;
    }
    try {
      await addWorkflowAction({
        projectId,
        stepId: targetStepIdForAction,
        title: newActionTitle.trim(),
        description: newActionDesc.trim(),
        status: 'pending',
      }).unwrap();
      setIsAddActionModalOpen(false);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || 'Failed to add action');
    }
  };

  const handleDeleteWorkflowAction = (stepId: string, actionId: string) => {
    Alert.alert('Delete Action', 'Are you sure you want to delete this action?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteWorkflowAction({ projectId, stepId, actionId }).unwrap();
            refetch();
          } catch (err: any) {
            Alert.alert('Error', err?.data?.message || 'Failed to delete action');
          }
        },
      },
    ]);
  };

  const pickChatImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow photo library access to attach images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const ext = asset.mimeType?.includes('png') ? 'png' : 'jpg';
        setSelectedChatFile({
          uri: asset.uri,
          name: asset.fileName || `chat-attachment-${Date.now()}.${ext}`,
          type: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not pick image');
    }
  };

  const takeChatPhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow camera access to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setSelectedChatFile({
          uri: asset.uri,
          name: asset.fileName || `camera-${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
          size: asset.fileSize,
        });
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not take photo');
    }
  };

  const handlePickAttachmentOptions = () => {
    Alert.alert('Attach File / Image', 'Select source', [
      { text: 'Photo Library', onPress: pickChatImage },
      { text: 'Take Photo', onPress: takeChatPhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleOpenFileOrPreview = async (rawUrl?: string, fileName?: string, mimeType?: string) => {
    if (!rawUrl) {
      Alert.alert('Unavailable', 'File URL is not available.');
      return;
    }
    const resolvedUrl = resolvePublicAssetUrl(rawUrl, session?.token);
    const isImage =
      (mimeType && mimeType.startsWith('image/')) ||
      /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fileName || '') ||
      /\.(jpg|jpeg|png|webp|gif|bmp)/i.test(rawUrl);

    if (isImage) {
      setPreviewImageModal({ url: resolvedUrl, title: fileName || 'Image Preview' });
    } else {
      try {
        const canOpen = await Linking.canOpenURL(resolvedUrl);
        if (canOpen) {
          await Linking.openURL(resolvedUrl);
        } else {
          Alert.alert('Cannot Open', 'No application found to view this file.');
        }
      } catch {
        Alert.alert('Error', 'Failed to open file');
      }
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() && !selectedChatFile) return;
    try {
      setIsUploadingChatFile(true);
      let attachmentsPayload: any[] = [];

      if (selectedChatFile) {
        const formData = new FormData();
        formData.append('file', {
          uri: selectedChatFile.uri,
          name: selectedChatFile.name,
          type: selectedChatFile.type,
        } as any);
        formData.append('folder', 'Chat Attachments');

        const uploadRes = await uploadProjectFile({ projectId, formData }).unwrap();
        const att = uploadRes.attachment || {};
        const fileRec = uploadRes.data || {};
        attachmentsPayload.push({
          attachment_id: att._id || att.id || fileRec.attachment_id || fileRec._id,
          original_name: selectedChatFile.name,
          mime_type: selectedChatFile.type,
          size_bytes: selectedChatFile.size,
          file_url: att.url || (fileRec.attachment_id && typeof fileRec.attachment_id === 'object' ? (fileRec.attachment_id as any).url : '') || '',
        });
        setSelectedChatFile(null);
      }

      await postMessage({
        projectId,
        content: chatInput.trim(),
        attachments: attachmentsPayload.length > 0 ? attachmentsPayload : undefined,
      }).unwrap();

      setChatInput('');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || err?.message || 'Failed to send message');
    } finally {
      setIsUploadingChatFile(false);
    }
  };

  const handleUploadFilesTab = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow photo access to upload files.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setIsUploadingTabFile(true);
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          name: asset.fileName || `project-file-${Date.now()}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        } as any);
        formData.append('folder', 'General');
        await uploadProjectFile({ projectId, formData }).unwrap();
        refetch();
        Alert.alert('Success', 'File uploaded successfully.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || err?.message || 'Failed to upload file');
    } finally {
      setIsUploadingTabFile(false);
    }
  };

  const handleDeleteFile = (fileId: string, fileName: string) => {
    Alert.alert('Delete File', `Are you sure you want to delete "${fileName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteProjectFile({ projectId, fileId }).unwrap();
            refetch();
            Alert.alert('Success', 'File removed successfully.');
          } catch (err: any) {
            Alert.alert('Error', err?.data?.message || 'Failed to delete file');
          }
        },
      },
    ]);
  };

  const handleConfirmClose = async () => {
    if (!closureRemarks.trim()) {
      Alert.alert('Required', 'Please enter closure sign-off remarks');
      return;
    }
    try {
      setIsExecutingClose(true);
      await closeProject({ id: projectId, remarks: closureRemarks.trim() }).unwrap();
      setIsClosing(false);
      setClosureRemarks('');
      refetch();
      Alert.alert('Success', 'Project formally closed.');
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || 'Failed to close project');
    } finally {
      setIsExecutingClose(false);
    }
  };

  const handleReopenProject = () => {
    Alert.alert(
      'Reopen Project',
      'Are you sure you want to reopen this project? Members will be able to perform workflow actions again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          onPress: async () => {
            try {
              await reopenProject(projectId).unwrap();
              refetch();
              Alert.alert('Success', 'Project has been reopened.');
            } catch (err: any) {
              Alert.alert('Error', err?.data?.message || 'Failed to reopen project');
            }
          },
        },
      ]
    );
  };

  const handleDeleteProject = () => {
    Alert.alert(
      'Delete Project',
      'Are you sure you want to permanently delete this project? All steps and data will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteProject(projectId).unwrap();
              Alert.alert('Success', 'Project deleted successfully.', [
                { text: 'OK', onPress: () => router.replace('/(tabs)/projects' as any) },
              ]);
            } catch (err: any) {
              Alert.alert('Error', err?.data?.message || 'Failed to delete project');
            }
          },
        },
      ]
    );
  };

  const handleAddMemberSubmit = async () => {
    if (!selectedUserId) {
      Alert.alert('Selection Required', 'Please select a user to add');
      return;
    }
    try {
      await addMember({ projectId, user_id: selectedUserId, role: selectedRole }).unwrap();
      setIsAddMemberModalOpen(false);
      setSelectedUserId('');
      setSelectedRole('contributor');
      setUserSearchText('');
      refetch();
      Alert.alert('Success', 'Member added to project.');
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || 'Failed to add member');
    }
  };

  const handleRemoveMemberPress = (memberUserId: string, memberName: string) => {
    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${memberName} from this project?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember({ projectId, userId: memberUserId }).unwrap();
              refetch();
            } catch (err: any) {
              Alert.alert('Error', err?.data?.message || 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const handleAssignTeamSubmit = async () => {
    if (!teamNameInput.trim()) {
      Alert.alert('Required', 'Please enter or select a team / department name');
      return;
    }
    try {
      await assignTeams({ projectId, team_names: [teamNameInput.trim()], auto_enroll: true }).unwrap();
      setIsAssignTeamModalOpen(false);
      setTeamNameInput('');
      refetch();
      Alert.alert('Success', 'Team assigned and members enrolled.');
    } catch (err: any) {
      Alert.alert('Error', err?.data?.message || 'Failed to assign team');
    }
  };

  const handleRemoveTeamPress = (teamName: string) => {
    Alert.alert('Remove Team', `Remove team "${teamName}" from assigned teams?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeTeam({ projectId, teamName }).unwrap();
            refetch();
          } catch (err: any) {
            Alert.alert('Error', err?.data?.message || 'Failed to remove team');
          }
        },
      },
    ]);
  };

  if (isLoading || !project) {
    return (
      <Screen>
        <AppHeader title="Project Workspace" showBack />
        <Loading label="Loading workspace…" />
      </Screen>
    );
  }

  const steps = project.steps || [];
  const messages = messagesData?.items || [];
  const assignedTeams = project.assigned_team_ids || [];

  const existingMemberIds = new Set(
    (project.members || []).map((m) =>
      typeof m.user_id === 'object' ? String(m.user_id._id) : String(m.user_id)
    )
  );

  const eligibleUsers = (eligibleData?.users || []).filter((u) => {
    const matches =
      u.name.toLowerCase().includes(userSearchText.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearchText.toLowerCase()) ||
      (u.department && u.department.toLowerCase().includes(userSearchText.toLowerCase()));
    return matches && !existingMemberIds.has(u._id);
  });

  return (
    <Screen scroll={false}>
      <AppHeader
        title={project.title || project.project_code || 'Project Workspace'}
        subtitle={project.category || undefined}
        showBack
      />

      {/* Project Status & Progress Ribbon */}
      <View style={[styles.projectHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.titleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <View style={{ backgroundColor: colors.cardAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800' }}>{project.project_code || 'PRJ'}</Text>
            </View>
            {project.category && (
              <View style={{ backgroundColor: colors.cardAlt, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '600' }}>{project.category}</Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={[
                styles.statusChip,
                { backgroundColor: isClosed ? '#9333ea20' : '#10b98120' },
              ]}
            >
              <Text
                style={[
                  styles.statusChipText,
                  { color: isClosed ? '#9333ea' : '#10b981' },
                ]}
              >
                {project.status?.toUpperCase()}
              </Text>
            </View>

            {canAdmin && !isClosed && (
              <>
                <Pressable
                  onPress={handleOpenEditProject}
                  style={[styles.smallActionBtn, { backgroundColor: colors.primary + '15' }]}
                >
                  <Ionicons name="create-outline" size={13} color={colors.primary} />
                  <Text style={[styles.smallActionBtnText, { color: colors.primary }]}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => setIsClosing(true)}
                  style={[styles.smallActionBtn, { backgroundColor: '#ef444415' }]}
                >
                  <Ionicons name="lock-closed-outline" size={13} color="#ef4444" />
                  <Text style={[styles.smallActionBtnText, { color: '#ef4444' }]}>Close</Text>
                </Pressable>
              </>
            )}

            {canAdmin && isClosed && (
              <Pressable
                onPress={handleReopenProject}
                style={[styles.smallActionBtn, { backgroundColor: '#2563eb15' }]}
              >
                <Ionicons name="refresh-outline" size={13} color="#2563eb" />
                <Text style={[styles.smallActionBtnText, { color: '#2563eb' }]}>Reopen</Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.progressRow}>
          <View style={styles.progressBarWrap}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${project.progress_percentage || 0}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.muted }]}>
            {project.progress_percentage || 0}% Complete ({project.completed_steps || 0}/{project.total_steps || steps.length} steps)
          </Text>
        </View>
      </View>

      {/* Tabs Selector Bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        <Pressable
          style={[styles.tabItem, activeTab === 'steps' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('steps')}
        >
          <Ionicons
            name="list-outline"
            size={16}
            color={activeTab === 'steps' ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'steps' ? colors.primary : colors.muted },
            ]}
          >
            Steps ({steps.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabItem, activeTab === 'chat' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('chat')}
        >
          <Ionicons
            name="chatbubbles-outline"
            size={16}
            color={activeTab === 'chat' ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'chat' ? colors.primary : colors.muted },
            ]}
          >
            Chat Room
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabItem, activeTab === 'files' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('files')}
        >
          <Ionicons
            name="folder-outline"
            size={16}
            color={activeTab === 'files' ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'files' ? colors.primary : colors.muted },
            ]}
          >
            Files
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tabItem, activeTab === 'overview' && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setActiveTab('overview')}
        >
          <Ionicons
            name="information-circle-outline"
            size={16}
            color={activeTab === 'overview' ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'overview' ? colors.primary : colors.muted },
            ]}
          >
            Team & Details
          </Text>
        </Pressable>
      </View>

      {/* TAB 1: ACTION STEPS & SEQUENTIAL WORKFLOW OF ACTIONS */}
      {activeTab === 'steps' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 2 }} showsVerticalScrollIndicator={false}>
          {steps.length === 0 ? (
            <Card>
              <Text style={{ color: colors.muted, textAlign: 'center' }}>No action steps defined.</Text>
            </Card>
          ) : (
            steps.map((step) => {
              const isCompleted = step.status === 'completed';
              const actions = step.workflow_actions || [];

              return (
                <Card key={step._id} style={{ marginBottom: 12 }}>
                  <View style={styles.stepHeader}>
                    <Text style={[styles.stepPhase, { color: colors.primary }]}>{step.phase_name}</Text>
                    <View
                      style={[
                        styles.stepStatusBtn,
                        { backgroundColor: isCompleted ? '#10b98120' : colors.cardAlt },
                      ]}
                    >
                      <Ionicons
                        name={isCompleted ? 'checkmark-circle' : 'time-outline'}
                        size={14}
                        color={isCompleted ? '#10b981' : colors.muted}
                      />
                      <Text style={[styles.stepStatusText, { color: isCompleted ? '#10b981' : colors.text }]}>
                        {step.status}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.stepTitle, { color: colors.text }]}>
                    #{step.step_number} {step.title}
                  </Text>

                  {step.description ? (
                    <Text style={[styles.stepDesc, { color: colors.muted }]} numberOfLines={2}>
                      {step.description}
                    </Text>
                  ) : null}

                  {/* Parent Step Workflow Action Buttons */}
                  {!isClosed && (
                    <View style={styles.stepActionsRow}>
                      <Text style={[styles.actionStepLabel, { color: colors.muted }]}>Step Action:</Text>

                      {step.status === 'pending' && (
                        <Pressable
                          onPress={() => openStepTransition(step, 'in_progress')}
                          style={[styles.workflowPillBtn, { backgroundColor: '#2563eb' }]}
                        >
                          <Ionicons name="play" size={11} color="#fff" />
                          <Text style={styles.workflowPillBtnText}>Start Step</Text>
                        </Pressable>
                      )}

                      {step.status === 'in_progress' && (
                        <>
                          <Pressable
                            onPress={() => openStepTransition(step, 'under_review')}
                            style={[styles.workflowPillBtn, { backgroundColor: '#d97706' }]}
                          >
                            <Ionicons name="time" size={11} color="#fff" />
                            <Text style={styles.workflowPillBtnText}>Review</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => openStepTransition(step, 'completed')}
                            style={[styles.workflowPillBtn, { backgroundColor: '#10b981' }]}
                          >
                            <Ionicons name="checkmark" size={11} color="#fff" />
                            <Text style={styles.workflowPillBtnText}>Complete</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => openStepTransition(step, 'blocked')}
                            style={[styles.workflowPillBtn, { backgroundColor: '#ef444420', borderColor: '#ef444440', borderWidth: 1 }]}
                          >
                            <Ionicons name="alert-circle" size={11} color="#ef4444" />
                            <Text style={[styles.workflowPillBtnText, { color: '#ef4444' }]}>Block</Text>
                          </Pressable>
                        </>
                      )}

                      {step.status === 'under_review' && (
                        <>
                          <Pressable
                            onPress={() => openStepTransition(step, 'completed')}
                            style={[styles.workflowPillBtn, { backgroundColor: '#10b981' }]}
                          >
                            <Ionicons name="checkmark-circle" size={11} color="#fff" />
                            <Text style={styles.workflowPillBtnText}>Approve</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => openStepTransition(step, 'in_progress')}
                            style={[styles.workflowPillBtn, { backgroundColor: '#2563eb' }]}
                          >
                            <Text style={styles.workflowPillBtnText}>Revise</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => openStepTransition(step, 'blocked')}
                            style={[styles.workflowPillBtn, { backgroundColor: '#ef444420', borderColor: '#ef444440', borderWidth: 1 }]}
                          >
                            <Ionicons name="alert-circle" size={11} color="#ef4444" />
                            <Text style={[styles.workflowPillBtnText, { color: '#ef4444' }]}>Block</Text>
                          </Pressable>
                        </>
                      )}

                      {step.status === 'blocked' && (
                        <Pressable
                          onPress={() => openStepTransition(step, 'in_progress')}
                          style={[styles.workflowPillBtn, { backgroundColor: '#2563eb' }]}
                        >
                          <Ionicons name="play" size={11} color="#fff" />
                          <Text style={styles.workflowPillBtnText}>Resume</Text>
                        </Pressable>
                      )}

                      {(step.status === 'completed' || step.status === 'skipped') && (
                        <Pressable
                          onPress={() => openStepTransition(step, 'in_progress')}
                          style={[styles.workflowPillBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border, borderWidth: 1 }]}
                        >
                          <Text style={[styles.workflowPillBtnText, { color: colors.text }]}>Reopen Step</Text>
                        </Pressable>
                      )}
                    </View>
                  )}

                  {/* Sequential Workflow Actions Sub-Section */}
                  <View style={styles.workflowSectionWrap}>
                    <View style={styles.workflowHeaderRow}>
                      <Text style={[styles.workflowSectionTitle, { color: colors.text }]}>
                        ⚡ Actions Workflow ({actions.length})
                      </Text>
                      {!isClosed && (
                        <Pressable
                          onPress={() => handleOpenAddActionModal(step._id)}
                          style={[styles.smallAddActionBtn, { backgroundColor: colors.primary + '15' }]}
                        >
                          <Ionicons name="add" size={13} color={colors.primary} />
                          <Text style={[styles.smallAddActionBtnText, { color: colors.primary }]}>Add Action</Text>
                        </Pressable>
                      )}
                    </View>

                    {actions.map((act, actIdx) => {
                      const isActDone = act.status === 'completed';
                      const isActProg = act.status === 'in_progress';
                      const isActBlock = act.status === 'blocked';

                      return (
                        <View
                          key={act._id || actIdx}
                          style={[
                            styles.workflowActionCard,
                            {
                              backgroundColor: isActDone
                                ? '#10b98110'
                                : isActProg
                                ? '#3b82f610'
                                : isActBlock
                                ? '#ef444410'
                                : colors.cardAlt,
                              borderColor: isActDone
                                ? '#10b98130'
                                : isActProg
                                ? '#3b82f640'
                                : isActBlock
                                ? '#ef444440'
                                : colors.border,
                            },
                          ]}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                            <View
                              style={[
                                styles.actionOrderPill,
                                {
                                  backgroundColor: isActDone
                                    ? '#10b981'
                                    : isActProg
                                    ? '#3b82f6'
                                    : isActBlock
                                    ? '#ef4444'
                                    : colors.muted + '40',
                                },
                              ]}
                            >
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                                {isActDone ? '✓' : actIdx + 1}
                              </Text>
                            </View>

                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.actionTitle,
                                  {
                                    color: isActDone ? colors.muted : colors.text,
                                    textDecorationLine: isActDone ? 'line-through' : 'none',
                                  },
                                ]}
                              >
                                {act.title}
                              </Text>
                              {act.remarks ? (
                                <Text style={{ color: colors.muted, fontSize: 10, fontStyle: 'italic' }}>
                                  &quot;{act.remarks}&quot;
                                </Text>
                              ) : null}
                            </View>
                          </View>

                          {/* Quick Action Control Buttons with Confirmation Modal */}
                          {!isClosed && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              {act.status === 'pending' && (
                                <Pressable
                                  onPress={() => openActionTransition(step, act, 'in_progress')}
                                  style={[styles.actionTriggerBtn, { backgroundColor: '#3b82f6' }]}
                                >
                                  <Text style={styles.actionTriggerText}>Start</Text>
                                </Pressable>
                              )}
                              {act.status === 'in_progress' && (
                                <>
                                  <Pressable
                                    onPress={() => openActionTransition(step, act, 'completed')}
                                    style={[styles.actionTriggerBtn, { backgroundColor: '#10b981' }]}
                                  >
                                    <Text style={styles.actionTriggerText}>Done</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => openActionTransition(step, act, 'blocked')}
                                    style={[styles.actionTriggerBtn, { backgroundColor: '#ef444420' }]}
                                  >
                                    <Text style={[styles.actionTriggerText, { color: '#ef4444' }]}>Block</Text>
                                  </Pressable>
                                </>
                              )}
                              {act.status === 'blocked' && (
                                <Pressable
                                  onPress={() => openActionTransition(step, act, 'in_progress')}
                                  style={[styles.actionTriggerBtn, { backgroundColor: '#3b82f6' }]}
                                >
                                  <Text style={styles.actionTriggerText}>Resume</Text>
                                </Pressable>
                              )}
                              {(act.status === 'completed' || act.status === 'skipped') && (
                                <Pressable
                                  onPress={() => openActionTransition(step, act, 'in_progress')}
                                  style={[styles.actionTriggerBtn, { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }]}
                                >
                                  <Text style={[styles.actionTriggerText, { color: colors.text }]}>Reopen</Text>
                                </Pressable>
                              )}
                              {canAdmin && (
                                <Pressable
                                  onPress={() => handleDeleteWorkflowAction(step._id, act._id!)}
                                  style={{ padding: 4 }}
                                >
                                  <Ionicons name="trash-outline" size={14} color="#ef4444" />
                                </Pressable>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Deliverables Checklist */}
                  {step.checklist && step.checklist.length > 0 && (
                    <View style={styles.checklistWrap}>
                      {step.checklist.map((item) => (
                        <Pressable
                          key={item._id}
                          onPress={() => !isClosed && handleToggleChecklist(step._id, item._id || '', item.is_completed)}
                          style={styles.checkItemRow}
                        >
                          <Ionicons
                            name={item.is_completed ? 'checkbox' : 'square-outline'}
                            size={16}
                            color={item.is_completed ? colors.primary : colors.muted}
                          />
                          <Text
                            style={[
                              styles.checkItemText,
                              {
                                color: item.is_completed ? colors.muted : colors.text,
                                textDecorationLine: item.is_completed ? 'line-through' : 'none',
                              },
                            ]}
                          >
                            {item.title}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      {/* TAB 2: LIVE CHAT ROOM WITH WORKFLOW DRAWER */}
      {activeTab === 'chat' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          {/* Top Workflow Roadmap Toggle Banner */}
          <Pressable
            onPress={() => setIsChatWorkflowDrawerOpen((prev) => !prev)}
            style={[styles.chatWorkflowBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="layers-outline" size={16} color={colors.primary} />
              <Text style={[styles.chatWorkflowBannerText, { color: colors.text }]}>
                Workflow System Plan ({steps.filter((s) => s.status === 'completed').length}/{steps.length} Steps Done)
              </Text>
            </View>
            <Ionicons
              name={isChatWorkflowDrawerOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.muted}
            />
          </Pressable>

          {/* Collapsible Roadmap Drawer in Chat */}
          {isChatWorkflowDrawerOpen && (
            <View style={[styles.chatRoadmapDrawer, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 4 }}>
                {steps.map((st, sIdx) => {
                  const isDone = st.status === 'completed';
                  const isProg = st.status === 'in_progress';
                  const isBlock = st.status === 'blocked';
                  const actions = st.workflow_actions || [];

                  return (
                    <View
                      key={st._id}
                      style={[
                        styles.miniStepCard,
                        {
                          backgroundColor: isDone
                            ? '#10b98115'
                            : isProg
                            ? '#3b82f615'
                            : isBlock
                            ? '#ef444415'
                            : colors.card,
                          borderColor: isDone
                            ? '#10b98140'
                            : isProg
                            ? '#3b82f640'
                            : isBlock
                            ? '#ef444440'
                            : colors.border,
                        },
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <Text style={[styles.miniStepTitle, { color: colors.text, flexShrink: 1 }]} numberOfLines={1}>
                          #{sIdx + 1} {st.title}
                        </Text>
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: '800',
                            color: isDone ? '#10b981' : isProg ? '#3b82f6' : isBlock ? '#ef4444' : colors.muted,
                            textTransform: 'uppercase',
                          }}
                        >
                          {st.status}
                        </Text>
                      </View>

                      {/* Parent Step Workflow Buttons inside Chat Drawer */}
                      {!isClosed && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          {st.status === 'pending' && (
                            <Pressable
                              onPress={() => openStepTransition(st, 'in_progress')}
                              style={[styles.workflowPillBtn, { backgroundColor: '#2563eb', paddingVertical: 2, paddingHorizontal: 6 }]}
                            >
                              <Text style={[styles.workflowPillBtnText, { fontSize: 9 }]}>Start Step</Text>
                            </Pressable>
                          )}
                          {st.status === 'in_progress' && (
                            <>
                              <Pressable
                                onPress={() => openStepTransition(st, 'completed')}
                                style={[styles.workflowPillBtn, { backgroundColor: '#10b981', paddingVertical: 2, paddingHorizontal: 6 }]}
                              >
                                <Text style={[styles.workflowPillBtnText, { fontSize: 9 }]}>Complete</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => openStepTransition(st, 'blocked')}
                                style={[styles.workflowPillBtn, { backgroundColor: '#ef444420', paddingVertical: 2, paddingHorizontal: 6 }]}
                              >
                                <Text style={[styles.workflowPillBtnText, { color: '#ef4444', fontSize: 9 }]}>Block</Text>
                              </Pressable>
                            </>
                          )}
                          {st.status === 'blocked' && (
                            <Pressable
                              onPress={() => openStepTransition(st, 'in_progress')}
                              style={[styles.workflowPillBtn, { backgroundColor: '#2563eb', paddingVertical: 2, paddingHorizontal: 6 }]}
                            >
                              <Text style={[styles.workflowPillBtnText, { fontSize: 9 }]}>Resume</Text>
                            </Pressable>
                          )}
                          {(st.status === 'completed' || st.status === 'skipped') && (
                            <Pressable
                              onPress={() => openStepTransition(st, 'in_progress')}
                              style={[styles.workflowPillBtn, { backgroundColor: colors.cardAlt, paddingVertical: 2, paddingHorizontal: 6 }]}
                            >
                              <Text style={[styles.workflowPillBtnText, { color: colors.text, fontSize: 9 }]}>Reopen</Text>
                            </Pressable>
                          )}
                        </View>
                      )}

                      {/* Quick sub-actions roadmap inside mini card */}
                      {actions.length > 0 && (
                        <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#00000010', gap: 2 }}>
                          {actions.map((act, aIdx) => (
                            <View key={act._id || aIdx} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                              <Text style={{ fontSize: 9, color: act.status === 'completed' ? colors.muted : colors.text, textDecorationLine: act.status === 'completed' ? 'line-through' : 'none', flexShrink: 1 }} numberOfLines={1}>
                                {aIdx + 1}. {act.title}
                              </Text>
                              {!isClosed && act.status === 'pending' && (
                                <Pressable
                                  onPress={() => openActionTransition(st, act, 'in_progress')}
                                  style={{ backgroundColor: '#3b82f6', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}
                                >
                                  <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>Start</Text>
                                </Pressable>
                              )}
                              {!isClosed && act.status === 'in_progress' && (
                                <Pressable
                                  onPress={() => openActionTransition(st, act, 'completed')}
                                  style={{ backgroundColor: '#10b981', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 }}
                                >
                                  <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800' }}>Done</Text>
                                </Pressable>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Chat Messages List */}
          <FlatList
            data={messages}
            keyExtractor={(m) => m._id}
            contentContainerStyle={{ paddingBottom: 16 }}
            renderItem={({ item }) => {
              const isSystemEvent = item.message_type === 'system_event';

              // SYSTEM ACTIVITY EVENT IN CHAT
              if (isSystemEvent) {
                return (
                  <View style={styles.systemEventWrap}>
                    <View style={[styles.systemEventCard, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '30' }]}>
                      <Ionicons name="pulse" size={14} color={colors.primary} />
                      <Text style={[styles.systemEventText, { color: colors.text }]}>
                        {item.content}
                      </Text>
                    </View>
                  </View>
                );
              }

              const senderIdStr = typeof item.sender_id === 'object' ? item.sender_id?._id : item.sender_id;
              const isMe = String(senderIdStr) === String(currentUserId);
              const attachments = item.attachments || [];

              return (
                <View style={[styles.messageBubbleWrap, { alignItems: isMe ? 'flex-end' : 'flex-start' }]}>
                  {!isMe && (
                    <Text style={[styles.senderName, { color: colors.muted }]}>
                      {item.sender_name} {item.sender_role ? `(${item.sender_role})` : ''}
                    </Text>
                  )}
                  <View
                    style={[
                      styles.messageBubble,
                      {
                        backgroundColor: isMe ? colors.primary : colors.card,
                        borderColor: isMe ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    {item.content ? (
                      <Text style={[styles.messageText, { color: isMe ? '#fff' : colors.text }]}>
                        {item.content}
                      </Text>
                    ) : null}

                    {/* Attachments within Message Bubble */}
                    {attachments.length > 0 && (
                      <View style={[styles.msgAttachmentWrap, Boolean(item.content) && { borderTopWidth: 1, borderTopColor: isMe ? '#ffffff30' : colors.border, paddingTop: 6 }]}>
                        {attachments.map((att, attIdx) => {
                          const rawAttId = typeof att.attachment_id === 'object' ? (att.attachment_id as any)?._id || (att.attachment_id as any)?.url : att.attachment_id;
                          const fileUrl = rawAttId
                            ? getAttachmentPreviewUrl(rawAttId, session?.token)
                            : (att.file_url ? resolvePublicAssetUrl(att.file_url, session?.token) : '');
                          const isImage =
                            (att.mime_type && att.mime_type.startsWith('image/')) ||
                            /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(att.original_name || '') ||
                            Boolean(fileUrl && /\.(jpg|jpeg|png|webp|gif|bmp)/i.test(fileUrl));

                          if (isImage && fileUrl) {
                            return (
                              <Pressable
                                key={att.attachment_id || attIdx}
                                onPress={() => handleOpenFileOrPreview(fileUrl, att.original_name, att.mime_type)}
                                style={styles.msgImagePressable}
                              >
                                <Image
                                  source={{ uri: fileUrl }}
                                  style={styles.msgImageThumb}
                                  resizeMode="cover"
                                />
                                <View style={[styles.msgImageOverlayRow, { backgroundColor: isMe ? '#00000050' : '#00000065' }]}>
                                  <Ionicons name="expand-outline" size={12} color="#fff" />
                                  <Text style={styles.msgImageOverlayText} numberOfLines={1}>
                                    {att.original_name}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          }

                          return (
                            <Pressable
                              key={att.attachment_id || attIdx}
                              onPress={() => handleOpenFileOrPreview(fileUrl, att.original_name, att.mime_type)}
                              style={[
                                styles.msgDocCard,
                                {
                                  backgroundColor: isMe ? '#00000020' : colors.cardAlt,
                                  borderColor: isMe ? '#ffffff30' : colors.border,
                                },
                              ]}
                            >
                              <Ionicons
                                name="document-text-outline"
                                size={18}
                                color={isMe ? '#fff' : colors.primary}
                              />
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={[
                                    styles.msgDocName,
                                    { color: isMe ? '#fff' : colors.text },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {att.original_name}
                                </Text>
                                {att.size_bytes ? (
                                  <Text
                                    style={[
                                      styles.msgDocSize,
                                      { color: isMe ? '#ffffffbb' : colors.muted },
                                    ]}
                                  >
                                    {(att.size_bytes / 1024).toFixed(0)} KB
                                  </Text>
                                ) : null}
                              </View>
                              <Ionicons
                                name="download-outline"
                                size={16}
                                color={isMe ? '#fff' : colors.primary}
                              />
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                  <Text style={[styles.messageTimestamp, { color: colors.muted }]}>
                    {item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </Text>
                </View>
              );
            }}
          />

          {/* Attachment Selected Preview Banner above input */}
          {selectedChatFile && (
            <View style={[styles.attachmentPreviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                {selectedChatFile.type.startsWith('image/') ? (
                  <Image source={{ uri: selectedChatFile.uri }} style={styles.attachmentThumb} />
                ) : (
                  <View style={[styles.attachmentIconBox, { backgroundColor: colors.primary + '15' }]}>
                    <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.attachmentPreviewName, { color: colors.text }]} numberOfLines={1}>
                    {selectedChatFile.name}
                  </Text>
                  <Text style={[styles.attachmentPreviewSize, { color: colors.muted }]}>
                    {selectedChatFile.size ? `${(selectedChatFile.size / 1024).toFixed(0)} KB • Ready to send` : 'Ready to send'}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => setSelectedChatFile(null)}
                disabled={isUploadingChatFile}
                style={[styles.attachmentRemoveBtn, { backgroundColor: colors.cardAlt }]}
              >
                <Ionicons name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
          )}

          {/* Chat Input Bar */}
          <View style={[styles.chatBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Pressable
              onPress={handlePickAttachmentOptions}
              disabled={isUploadingChatFile}
              style={[styles.chatAttachBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
            >
              <Ionicons name="attach-outline" size={20} color={colors.primary} />
            </Pressable>
            <TextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Type message..."
              placeholderTextColor={colors.muted}
              style={[styles.chatTextInput, { color: colors.text }]}
            />
            <Pressable
              onPress={handleSendMessage}
              disabled={isUploadingChatFile || (!chatInput.trim() && !selectedChatFile)}
              style={[
                styles.chatSendBtn,
                {
                  backgroundColor:
                    (!chatInput.trim() && !selectedChatFile) || isUploadingChatFile
                      ? colors.muted + '60'
                      : colors.primary,
                },
              ]}
            >
              {isUploadingChatFile ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={16} color="#fff" />
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* TAB 3: FILES HUB */}
      {activeTab === 'files' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 2 }} showsVerticalScrollIndicator={false}>
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 2 }]}>Project Files</Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>Documents, images, and deliverables</Text>
              </View>
              <Pressable
                onPress={handleUploadFilesTab}
                disabled={isUploadingTabFile}
                style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
              >
                {isUploadingTabFile ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={14} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>Upload</Text>
                  </>
                )}
              </Pressable>
            </View>
          </Card>

          {!files || files.length === 0 ? (
            <Card>
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Ionicons name="folder-open-outline" size={40} color={colors.muted} style={{ opacity: 0.5, marginBottom: 8 }} />
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, marginBottom: 4 }}>No files uploaded yet</Text>
                <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>
                  Files sent in chat or uploaded here will appear in this hub.
                </Text>
              </View>
            </Card>
          ) : (
            files.map((file) => {
              const rawAttId = typeof file.attachment_id === 'object' ? (file.attachment_id as any)?._id || (file.attachment_id as any)?.url : file.attachment_id;
              const fileUrl = rawAttId ? getAttachmentPreviewUrl(rawAttId, session?.token) : '';
              const isImage =
                (file.mime_type && file.mime_type.startsWith('image/')) ||
                /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(file.file_name || '');
              const canDelete =
                canAdmin ||
                (typeof file.uploaded_by === 'object' ? file.uploaded_by?._id === currentUserId : file.uploaded_by === currentUserId);

              return (
                <Card key={file._id} style={{ marginBottom: 8 }}>
                  <Pressable
                    onPress={() => handleOpenFileOrPreview(fileUrl, file.file_name, file.mime_type)}
                    style={styles.fileRow}
                  >
                    {isImage && fileUrl ? (
                      <Image
                        source={{ uri: fileUrl }}
                        style={{ width: 44, height: 44, borderRadius: 8 }}
                      />
                    ) : (
                      <View style={[styles.attachmentIconBox, { backgroundColor: colors.primary + '15' }]}>
                        <Ionicons name="document-text-outline" size={22} color={colors.primary} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                        {file.file_name}
                      </Text>
                      <Text style={[styles.fileFolder, { color: colors.muted }]}>
                        {file.folder || 'General'} • {file.size_bytes ? `${(file.size_bytes / 1024).toFixed(0)} KB` : 'File'} • {file.uploader_name || 'Member'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Pressable
                        onPress={() => handleOpenFileOrPreview(fileUrl, file.file_name, file.mime_type)}
                        style={[styles.smallIconBtn, { backgroundColor: colors.cardAlt }]}
                      >
                        <Ionicons name="eye-outline" size={16} color={colors.primary} />
                      </Pressable>
                      {canDelete && (
                        <Pressable
                          onPress={() => handleDeleteFile(file._id, file.file_name)}
                          style={[styles.smallIconBtn, { backgroundColor: '#ef444415' }]}
                        >
                          <Ionicons name="trash-outline" size={16} color="#ef4444" />
                        </Pressable>
                      )}
                    </View>
                  </Pressable>
                </Card>
              );
            })
          )}
        </ScrollView>
      )}

      {/* TAB 4: OVERVIEW & TEAM MANAGEMENT */}
      {activeTab === 'overview' && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 2 }} showsVerticalScrollIndicator={false}>
          <Card style={{ marginBottom: 12 }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Project Information</Text>
              {canAdmin && !isClosed && (
                <Pressable
                  onPress={handleOpenEditProject}
                  style={[styles.smallActionBtn, { backgroundColor: colors.primary + '15' }]}
                >
                  <Ionicons name="create-outline" size={13} color={colors.primary} />
                  <Text style={[styles.smallActionBtnText, { color: colors.primary }]}>Edit</Text>
                </Pressable>
              )}
            </View>
            <Text style={[styles.overviewBody, { color: colors.muted }]}>
              {project.description || 'No description provided.'}
            </Text>
          </Card>

          {/* Assigned Teams Section */}
          <Card style={{ marginBottom: 12 }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Assigned Teams & Departments</Text>
              {canAdmin && !isClosed && (
                <Pressable
                  onPress={() => setIsAssignTeamModalOpen(true)}
                  style={[styles.smallActionBtn, { backgroundColor: colors.primary + '20' }]}
                >
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text style={[styles.smallActionBtnText, { color: colors.primary }]}>Assign Team</Text>
                </Pressable>
              )}
            </View>

            {assignedTeams.length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>No teams assigned yet.</Text>
            ) : (
              <View style={styles.teamsChipWrap}>
                {assignedTeams.map((team, idx) => (
                  <View key={idx} style={[styles.teamChip, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}>
                    <Ionicons name="business-outline" size={13} color={colors.primary} />
                    <Text style={[styles.teamChipText, { color: colors.text }]}>{team}</Text>
                    {canAdmin && !isClosed && (
                      <Pressable onPress={() => handleRemoveTeamPress(team)} style={{ padding: 2 }}>
                        <Ionicons name="close-circle" size={14} color={colors.muted} />
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* Team Members Section */}
          <Card style={{ marginBottom: 12 }}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Team Members ({project.members?.length || 0})
              </Text>
              {canAdmin && !isClosed && (
                <Pressable
                  onPress={() => setIsAddMemberModalOpen(true)}
                  style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
                >
                  <Ionicons name="person-add" size={13} color="#fff" />
                  <Text style={[styles.smallActionBtnText, { color: '#fff' }]}>Add Member</Text>
                </Pressable>
              )}
            </View>

            {(project.members || []).map((m, idx) => {
              const memberRawId = typeof m.user_id === 'object' ? String(m.user_id._id) : String(m.user_id);
              const name = typeof m.user_id === 'object' ? m.user_id?.name : m.user_name || 'Member';
              const email = typeof m.user_id === 'object' ? m.user_id?.email : m.user_email || '';

              return (
                <View key={idx} style={[styles.memberRow, { borderBottomColor: colors.border }]}>
                  <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.memberName, { color: colors.text }]}>{name}</Text>
                    {email ? <Text style={[styles.memberEmail, { color: colors.muted }]}>{email}</Text> : null}
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: colors.cardAlt }]}>
                    <Text style={[styles.roleText, { color: colors.primary }]}>{m.role.toUpperCase()}</Text>
                  </View>
                  {canAdmin && !isClosed && (
                    <Pressable
                      onPress={() => handleRemoveMemberPress(memberRawId, name)}
                      style={{ padding: 6, marginLeft: 4 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#ef4444" />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </Card>
          {/* Project Management Actions Section for Admins */}
          {canAdmin && (
            <Card style={{ marginBottom: 12 }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Project Lifecycle Actions</Text>
              </View>
              <View style={{ gap: 8, marginTop: 4 }}>
                {!isClosed ? (
                  <Button
                    label="Close Project"
                    variant="danger"
                    onPress={() => setIsClosing(true)}
                  />
                ) : (
                  <Button
                    label="Reopen Project"
                    variant="primary"
                    onPress={handleReopenProject}
                  />
                )}
                <Button
                  label="Delete Project"
                  variant="ghost"
                  onPress={handleDeleteProject}
                />
              </View>
            </Card>
          )}
        </ScrollView>
      )}

      {/* EDIT PROJECT MODAL (WEB PARITY) */}
      <Modal visible={isEditProjectModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="create-outline" size={20} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Project Settings</Text>
              </View>
              <Pressable onPress={() => setIsEditProjectModalOpen(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView style={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
              {/* Title */}
              <Text style={[styles.inputLabel, { color: colors.text }]}>Project Title *</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Project title..."
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
              />

              {/* Description */}
              <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>Description</Text>
              <TextInput
                value={editDesc}
                onChangeText={setEditDesc}
                placeholder="Project description, scope & goals..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                style={[styles.remarksInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
              />

              {/* Category */}
              <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {EDIT_CATEGORY_OPTIONS.map((cat) => {
                    const isSelected = editCategory === cat;
                    return (
                      <Pressable
                        key={cat}
                        onPress={() => setEditCategory(cat)}
                        style={[
                          styles.pmOptionChip,
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
              <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>Priority</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {EDIT_PRIORITY_OPTIONS.map((p) => {
                  const isSelected = editPriority === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => setEditPriority(p.key)}
                      style={[
                        styles.pmOptionChip,
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

              {/* Status */}
              <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>Project Status</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {EDIT_STATUS_OPTIONS.map((st) => {
                    const isSelected = editStatus === st.key;
                    return (
                      <Pressable
                        key={st.key}
                        onPress={() => setEditStatus(st.key)}
                        style={[
                          styles.pmOptionChip,
                          {
                            backgroundColor: isSelected ? st.color : colors.cardAlt,
                            borderColor: isSelected ? colors.primary : colors.border,
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

              {/* Dates */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Start Date (YYYY-MM-DD)</Text>
                  <TextInput
                    value={editStartDate}
                    onChangeText={setEditStartDate}
                    placeholder="2026-10-01"
                    placeholderTextColor={colors.muted}
                    style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>Target End Date</Text>
                  <TextInput
                    value={editTargetEndDate}
                    onChangeText={setEditTargetEndDate}
                    placeholder="2026-12-31"
                    placeholderTextColor={colors.muted}
                    style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
                  />
                </View>
              </View>

              {/* Tags */}
              <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>Tags (Comma Separated)</Text>
              <TextInput
                value={editTags}
                onChangeText={setEditTags}
                placeholder="e.g. Audit, Q4, Launch"
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
              />

              {/* Project Manager Selection */}
              <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>Project Manager / Lead</Text>
              <View style={[styles.searchFilterWrap, { borderColor: colors.border, backgroundColor: colors.cardAlt }]}>
                <Ionicons name="search" size={13} color={colors.muted} />
                <TextInput
                  value={editPmSearch}
                  onChangeText={setEditPmSearch}
                  placeholder="Filter manager by name, email..."
                  placeholderTextColor={colors.muted}
                  style={[styles.miniSearchText, { color: colors.text }]}
                />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(eligibleData?.users || [])
                    .filter(
                      (u) =>
                        u.name.toLowerCase().includes(editPmSearch.toLowerCase()) ||
                        u.email.toLowerCase().includes(editPmSearch.toLowerCase())
                    )
                    .slice(0, 15)
                    .map((u) => {
                      const isSelected = editPmId === u._id;
                      return (
                        <Pressable
                          key={u._id}
                          onPress={() => setEditPmId(isSelected ? '' : u._id)}
                          style={[
                            styles.pmOptionChip,
                            {
                              backgroundColor: isSelected ? colors.primary : colors.cardAlt,
                              borderColor: isSelected ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Ionicons name="person" size={12} color={isSelected ? '#fff' : colors.primary} />
                          <Text
                            style={{
                              color: isSelected ? '#fff' : colors.text,
                              fontSize: 11,
                              fontWeight: '700',
                            }}
                          >
                            {u.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              </ScrollView>

              {/* Assigned Teams */}
              <Text style={[styles.inputLabel, { color: colors.text, marginTop: 10 }]}>Assigned Departments / Teams</Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginVertical: 4 }}>
                {(eligibleData?.teams || []).map((tm) => {
                  const isSelected = editSelectedTeams.includes(tm);
                  return (
                    <Pressable
                      key={tm}
                      onPress={() =>
                        setEditSelectedTeams((prev) =>
                          prev.includes(tm) ? prev.filter((t) => t !== tm) : [...prev, tm]
                        )
                      }
                      style={[
                        styles.pmOptionChip,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.cardAlt,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Ionicons name="business" size={11} color={isSelected ? '#fff' : colors.primary} />
                      <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 11, fontWeight: '700' }}>
                        {tm}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                <TextInput
                  value={editCustomTeamInput}
                  onChangeText={setEditCustomTeamInput}
                  placeholder="Add custom department..."
                  placeholderTextColor={colors.muted}
                  style={[styles.searchInput, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.cardAlt }]}
                />
                <Pressable
                  onPress={() => {
                    const trimmed = editCustomTeamInput.trim();
                    if (trimmed && !editSelectedTeams.includes(trimmed)) {
                      setEditSelectedTeams((prev) => [...prev, trimmed]);
                    }
                    setEditCustomTeamInput('');
                  }}
                  style={{
                    backgroundColor: colors.primary,
                    paddingHorizontal: 12,
                    justifyContent: 'center',
                    borderRadius: 10,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Add</Text>
                </Pressable>
              </View>

              {/* Assigned Members Roster */}
              <Text style={[styles.inputLabel, { color: colors.text, marginTop: 12 }]}>
                Project Members Roster ({editMembers.length})
              </Text>

              {/* Search candidate member */}
              <View style={[styles.searchFilterWrap, { borderColor: colors.border, backgroundColor: colors.cardAlt }]}>
                <Ionicons name="search" size={13} color={colors.muted} />
                <TextInput
                  value={editMemberSearch}
                  onChangeText={setEditMemberSearch}
                  placeholder="Filter users to add..."
                  placeholderTextColor={colors.muted}
                  style={[styles.miniSearchText, { color: colors.text }]}
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 6 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {(eligibleData?.users || [])
                    .filter(
                      (u) =>
                        !editMembers.some((m) => m.user_id === u._id) &&
                        (u.name.toLowerCase().includes(editMemberSearch.toLowerCase()) ||
                          u.email.toLowerCase().includes(editMemberSearch.toLowerCase()))
                    )
                    .slice(0, 15)
                    .map((u) => {
                      const isChosen = editSelectedMemberId === u._id;
                      return (
                        <Pressable
                          key={u._id}
                          onPress={() => setEditSelectedMemberId(isChosen ? '' : u._id)}
                          style={[
                            styles.pmOptionChip,
                            {
                              backgroundColor: isChosen ? colors.primary + '20' : colors.cardAlt,
                              borderColor: isChosen ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          <Ionicons name="person-add" size={12} color={colors.primary} />
                          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{u.name}</Text>
                        </Pressable>
                      );
                    })}
                </View>
              </ScrollView>

              {editSelectedMemberId ? (
                <View style={{ backgroundColor: colors.cardAlt, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, marginVertical: 4 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: colors.muted, marginBottom: 4 }}>ROLE</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      {EDIT_ROLE_OPTIONS.map((r) => {
                        const isSelected = editSelectedMemberRole === r.value;
                        return (
                          <Pressable
                            key={r.value}
                            onPress={() => setEditSelectedMemberRole(r.value)}
                            style={[
                              styles.pmOptionChip,
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
                    onPress={() => {
                      const userToAdd = (eligibleData?.users || []).find((u) => u._id === editSelectedMemberId);
                      if (userToAdd) {
                        setEditMembers((prev) => [
                          ...prev,
                          {
                            user_id: userToAdd._id,
                            user_name: userToAdd.name,
                            user_email: userToAdd.email,
                            role: editSelectedMemberRole,
                          },
                        ]);
                        setEditSelectedMemberId('');
                        setEditMemberSearch('');
                      }
                    }}
                    style={{
                      backgroundColor: colors.primary,
                      paddingVertical: 6,
                      borderRadius: 8,
                      alignItems: 'center',
                      marginTop: 6,
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>Add to Members Roster</Text>
                  </Pressable>
                </View>
              ) : null}

              {/* Added Members Roster List */}
              {editMembers.length > 0 && (
                <View style={{ gap: 4, marginTop: 6, marginBottom: 12 }}>
                  {editMembers.map((m) => (
                    <View
                      key={m.user_id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 8,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.cardAlt,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>{m.user_name}</Text>
                        {m.user_email ? (
                          <Text style={{ color: colors.muted, fontSize: 9 }}>{m.user_email}</Text>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ backgroundColor: colors.primary + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ color: colors.primary, fontSize: 9, fontWeight: '800' }}>
                            {m.role.toUpperCase()}
                          </Text>
                        </View>
                        <Pressable onPress={() => setEditMembers((prev) => prev.filter((item) => item.user_id !== m.user_id))}>
                          <Ionicons name="trash-outline" size={14} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button label="Cancel" variant="ghost" onPress={() => setIsEditProjectModalOpen(false)} />
              <Button label="Save Changes" onPress={handleSaveProjectEdit} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ADD WORKFLOW ACTION MODAL */}
      <Modal visible={isAddActionModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Workflow Action to Step</Text>
              <Pressable onPress={() => setIsAddActionModalOpen(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>Action Title *</Text>
            <TextInput
              value={newActionTitle}
              onChangeText={setNewActionTitle}
              placeholder="e.g. Conduct audit review, Upload report..."
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.text, borderColor: colors.border }]}
            />

            <Text style={[styles.inputLabel, { color: colors.text }]}>Description (Optional)</Text>
            <TextInput
              value={newActionDesc}
              onChangeText={setNewActionDesc}
              placeholder="Action instructions / details..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={2}
              style={[styles.remarksInput, { color: colors.text, borderColor: colors.border }]}
            />

            <View style={styles.modalActions}>
              <Button label="Cancel" variant="ghost" onPress={() => setIsAddActionModalOpen(false)} />
              <Button label="Add Action" onPress={handleSaveNewAction} disabled={!newActionTitle.trim()} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Member Modal */}
      <Modal visible={isAddMemberModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Add Project Member</Text>
              <Pressable onPress={() => setIsAddMemberModalOpen(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <TextInput
              value={userSearchText}
              onChangeText={setUserSearchText}
              placeholder="Search by name, email, department..."
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.text, borderColor: colors.border }]}
            />

            <ScrollView style={{ maxHeight: 180, marginVertical: 8 }}>
              {eligibleUsers.length === 0 ? (
                <Text style={{ color: colors.muted, textAlign: 'center', marginVertical: 12 }}>
                  No available users found
                </Text>
              ) : (
                eligibleUsers.map((u) => (
                  <Pressable
                    key={u._id}
                    onPress={() => setSelectedUserId(u._id)}
                    style={[
                      styles.userOption,
                      {
                        backgroundColor: selectedUserId === u._id ? colors.primary + '20' : 'transparent',
                        borderColor: selectedUserId === u._id ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userOptionName, { color: colors.text }]}>{u.name}</Text>
                      <Text style={[styles.userOptionEmail, { color: colors.muted }]}>
                        {u.email} • {u.department || 'General'}
                      </Text>
                    </View>
                    {selectedUserId === u._id && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                    )}
                  </Pressable>
                ))
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Button label="Cancel" variant="ghost" onPress={() => setIsAddMemberModalOpen(false)} />
              <Button label="Add Member" onPress={handleAddMemberSubmit} disabled={!selectedUserId} />
            </View>
          </View>
        </View>
      </Modal>

      {/* Assign Team Modal */}
      <Modal visible={isAssignTeamModalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Assign Team / Department</Text>
              <Pressable onPress={() => setIsAssignTeamModalOpen(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <TextInput
              value={teamNameInput}
              onChangeText={setTeamNameInput}
              placeholder="e.g. Engineering, Sales, QA"
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, { color: colors.text, borderColor: colors.border }]}
            />

            {eligibleData?.teams && eligibleData.teams.length > 0 && (
              <View style={{ marginVertical: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6, fontWeight: '700' }}>
                  SUGGESTED DEPARTMENTS:
                </Text>
                <View style={styles.teamsChipWrap}>
                  {eligibleData.teams.map((t, idx) => (
                    <Pressable
                      key={idx}
                      onPress={() => setTeamNameInput(t)}
                      style={[
                        styles.teamChip,
                        {
                          backgroundColor: teamNameInput === t ? colors.primary : colors.cardAlt,
                          borderColor: teamNameInput === t ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text style={{ color: teamNameInput === t ? '#fff' : colors.text, fontSize: 11, fontWeight: '700' }}>
                        {t}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.modalActions}>
              <Button label="Cancel" variant="ghost" onPress={() => setIsAssignTeamModalOpen(false)} />
              <Button label="Assign Team" onPress={handleAssignTeamSubmit} disabled={!teamNameInput.trim()} />
            </View>
          </View>
        </View>
      </Modal>

      {/* WORKFLOW TRANSITION CONFIRMATION MODAL */}
      <Modal visible={!!transitionModal?.isOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons
                  name={transitionModal?.targetType === 'step' ? 'layers' : 'flash'}
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Confirm {transitionModal?.targetType === 'step' ? 'Step' : 'Action'} Transition
                </Text>
              </View>
              <Pressable onPress={() => setTransitionModal(null)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.text, fontWeight: '700' }]}>
              {transitionModal?.stepNumber ? `Step #${transitionModal.stepNumber}: ` : ''}
              {transitionModal?.itemTitle}
            </Text>

            {/* Transition Path Badge Row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase' }}>
                  {transitionModal?.currentStatus}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color={colors.primary} />
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.primary + '20', borderWidth: 1, borderColor: colors.primary + '40' }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.primary, textTransform: 'uppercase' }}>
                  {transitionModal?.targetStatus}
                </Text>
              </View>
            </View>

            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Execution Remarks & Notes {transitionModal?.targetStatus === 'blocked' ? '(Required)' : '(Optional)'}
            </Text>
            <TextInput
              value={transitionRemarks}
              onChangeText={setTransitionRemarks}
              placeholder={
                transitionModal?.targetStatus === 'blocked'
                  ? 'Describe blocker reason...'
                  : 'Add execution notes, updates or remarks...'
              }
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={[styles.remarksInput, { borderColor: colors.border, color: colors.text, minHeight: 60 }]}
            />

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setTransitionModal(null)}
              />
              <Button
                label={isExecutingTransition ? 'Updating…' : 'Confirm Transition'}
                disabled={isExecutingTransition || (transitionModal?.targetStatus === 'blocked' && !transitionRemarks.trim())}
                onPress={handleConfirmTransition}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin Close Project Modal */}
      <Modal
        visible={isClosing}
        transparent
        animationType="fade"
        onRequestClose={() => setIsClosing(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="lock-closed" size={20} color="#ef4444" />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Close Project Confirmation</Text>
              </View>
              <Pressable onPress={() => setIsClosing(false)}>
                <Ionicons name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
            <Text style={[styles.modalSubtitle, { color: colors.muted, marginBottom: 12 }]}>
              Enter final sign-off remarks to formally conclude and close this project.
            </Text>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Sign-off Remarks *</Text>
            <TextInput
              value={closureRemarks}
              onChangeText={setClosureRemarks}
              placeholder="Final sign-off summary, outcomes, and closure notes..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={4}
              style={[
                styles.remarksInput,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.cardAlt,
                  minHeight: 90,
                  textAlignVertical: 'top',
                },
              ]}
            />
            <View style={[styles.modalActions, { marginTop: 16 }]}>
              <Button label="Cancel" variant="ghost" onPress={() => setIsClosing(false)} />
              <Button
                label={isExecutingClose ? 'Closing…' : 'Confirm & Close Project'}
                variant="danger"
                disabled={isExecutingClose || !closureRemarks.trim()}
                onPress={handleConfirmClose}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* FULL-SCREEN IMAGE VIEWER MODAL */}
      <Modal
        visible={Boolean(previewImageModal)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImageModal(null)}
      >
        <View style={styles.imageViewerOverlay}>
          <View style={styles.imageViewerHeader}>
            <Text style={styles.imageViewerTitle} numberOfLines={1}>
              {previewImageModal?.title || 'Preview'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable
                onPress={() => {
                  if (previewImageModal?.url) {
                    Linking.openURL(previewImageModal.url);
                  }
                }}
                style={styles.imageViewerBtn}
              >
                <Ionicons name="open-outline" size={20} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => setPreviewImageModal(null)}
                style={styles.imageViewerBtn}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
            </View>
          </View>
          {previewImageModal?.url ? (
            <View style={styles.imageViewerBody}>
              <Image
                source={{ uri: previewImageModal.url }}
                style={styles.imageViewerFull}
                resizeMode="contain"
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  projectHeader: {
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  projectTitle: {
    fontSize: 16,
    fontWeight: '800',
    flex: 1,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusChipText: {
    fontSize: 10,
    fontWeight: '800',
  },
  progressRow: {
    marginTop: 10,
    gap: 4,
  },
  progressBarWrap: {
    height: 6,
    borderRadius: 4,
    backgroundColor: '#00000015',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 4,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  stepHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  stepPhase: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stepStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  stepStatusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 12,
    marginBottom: 6,
  },
  stepActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginVertical: 6,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#00000010',
  },
  actionStepLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginRight: 2,
  },
  workflowPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  workflowPillBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
  workflowSectionWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#00000015',
    gap: 6,
  },
  workflowHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workflowSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  smallAddActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 2,
  },
  smallAddActionBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  workflowActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionOrderPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  actionTriggerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  actionTriggerText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  checklistWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#00000015',
    gap: 6,
  },
  checkItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkItemText: {
    fontSize: 12,
    fontWeight: '500',
  },
  chatWorkflowBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  chatWorkflowBannerText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chatRoadmapDrawer: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  miniStepCard: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 6,
    minWidth: 100,
  },
  miniStepTitle: {
    fontSize: 10,
    fontWeight: '700',
  },
  systemEventWrap: {
    alignItems: 'center',
    marginVertical: 4,
    paddingHorizontal: 16,
  },
  systemEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  systemEventText: {
    fontSize: 10,
    fontWeight: '600',
    flexShrink: 1,
  },
  messageBubbleWrap: {
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  senderName: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 2,
  },
  messageBubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    maxWidth: '80%',
    borderWidth: 1,
  },
  messageText: {
    fontSize: 13,
  },
  messageTimestamp: {
    fontSize: 9,
    marginTop: 2,
    marginHorizontal: 4,
  },
  msgAttachmentWrap: {
    marginTop: 6,
    gap: 6,
  },
  msgImagePressable: {
    borderRadius: 10,
    overflow: 'hidden',
    marginTop: 2,
  },
  msgImageThumb: {
    width: 220,
    height: 150,
    borderRadius: 10,
    backgroundColor: '#00000010',
  },
  msgImageOverlayRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  msgImageOverlayText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  msgDocCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: 180,
  },
  msgDocName: {
    fontSize: 11,
    fontWeight: '700',
  },
  msgDocSize: {
    fontSize: 9,
    marginTop: 1,
  },
  attachmentPreviewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  attachmentThumb: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  attachmentIconBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentPreviewName: {
    fontSize: 12,
    fontWeight: '700',
  },
  attachmentPreviewSize: {
    fontSize: 10,
    marginTop: 2,
  },
  attachmentRemoveBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  chatAttachBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  chatTextInput: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#00000008',
    paddingHorizontal: 12,
    fontSize: 13,
  },
  chatSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '700',
  },
  fileFolder: {
    fontSize: 11,
    marginTop: 2,
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    justifyContent: 'space-between',
  },
  imageViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingBottom: 16,
  },
  imageViewerTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
    marginRight: 12,
  },
  imageViewerBtn: {
    padding: 6,
  },
  imageViewerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  imageViewerFull: {
    width: '100%',
    height: '100%',
  },
  smallIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  overviewBody: {
    fontSize: 12,
    lineHeight: 18,
  },
  smallActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  smallActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  teamsChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  teamChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  memberName: {
    fontSize: 12,
    fontWeight: '700',
  },
  memberEmail: {
    fontSize: 10,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 9,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginBottom: 10,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
  },
  searchInput: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
    marginBottom: 6,
  },
  remarksInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    fontSize: 12,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  pmOptionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
  },
  userOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  userOptionName: {
    fontSize: 12,
    fontWeight: '700',
  },
  userOptionEmail: {
    fontSize: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  searchFilterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 34,
    gap: 6,
    marginVertical: 4,
  },
  miniSearchText: {
    flex: 1,
    fontSize: 11,
    paddingVertical: 0,
  },
  closureModal: {
    padding: 16,
    margin: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
});
