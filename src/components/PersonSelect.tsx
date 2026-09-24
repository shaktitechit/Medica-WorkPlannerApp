import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "@/theme";

export type SelectPerson = { _id: string; name?: string; email?: string };

function personLabel(person: SelectPerson, selfId?: string) {
  if (selfId && person._id === selfId) return "Me";
  return person.name || person.email || person._id;
}

export function PersonSelect({
  label,
  people,
  value,
  selfId,
  onChange,
  placeholder = "Select a person",
  searchPlaceholder = "Search name or email",
  icon = "person-outline",
}: {
  label: string;
  people: SelectPerson[];
  value: string;
  selfId?: string;
  onChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = people.find((person) => person._id === value);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) => `${person.name || ""} ${person.email || ""}`.toLowerCase().includes(needle));
  }, [people, query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={{
          minHeight: 44,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.input,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Ionicons name={icon} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
            {selected ? personLabel(selected, selfId) : placeholder}
          </Text>
          {selected?.email ? (
            <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
              {selected.email}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }} onPress={close} />
          <View
            style={{
              maxHeight: "80%",
              backgroundColor: colors.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 999, backgroundColor: colors.border, marginBottom: 12 }} />
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700", marginBottom: 12 }}>{label}</Text>
            <View
              style={{
                minHeight: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.input,
                paddingHorizontal: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 10 }}
              />
              {query ? (
                <Pressable accessibilityLabel="Clear search" onPress={() => setQuery("")}>
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
              {matches.length === 0 ? (
                <Text style={{ color: colors.muted, paddingVertical: 16 }}>No one matches that search.</Text>
              ) : (
                matches.map((person) => {
                  const active = person._id === value;
                  return (
                    <Pressable
                      key={person._id}
                      accessibilityRole="button"
                      onPress={() => {
                        onChange(person._id);
                        close();
                      }}
                      style={{
                        minHeight: 52,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        marginBottom: 6,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        backgroundColor: active ? colors.primarySoft : colors.cardAlt,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>
                          {personLabel(person, selfId)}
                        </Text>
                        {person.email ? (
                          <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                            {person.email}
                          </Text>
                        ) : null}
                      </View>
                      {active ? <Ionicons name="checkmark" size={18} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
