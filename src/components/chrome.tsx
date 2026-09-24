import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { File, Paths } from "expo-file-system";
import { useRouter } from "expo-router";
import { useGetCompanyInfoQuery } from "@/store/api/companyApiSlice";
import { resolvePublicAssetUrl } from "@/lib/env";
import { useThemeColors } from "@/theme";

let cachedDataLogo: { source: string; uri: string } | null = null;

function fileUriForDataImage(dataUri: string): string {
  if (cachedDataLogo?.source === dataUri) return cachedDataLogo.uri;
  const match = dataUri.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if (!match) return dataUri;
  const subtype = match[1].toLowerCase();
  const ext = subtype === "jpeg" || subtype === "jpg" ? "jpg" : subtype.split("+")[0] || "png";
  const file = new File(Paths.cache, `company-logo.${ext}`);
  file.create({ overwrite: true });
  file.write(match[2].replace(/\s/g, ""), { encoding: "base64" });
  cachedDataLogo = { source: dataUri, uri: file.uri };
  return file.uri;
}

function useChromeStyles() {
  const colors = useThemeColors();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        fallback: {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colors.border,
        },
        back: { paddingLeft: 4, paddingRight: 8, paddingVertical: 4 },
        headerLogo: { paddingRight: 12 },
      }),
    [colors],
  );
  return { colors, styles };
}

export function CompanyLogo({ size = 40 }: { size?: number }) {
  const { colors, styles } = useChromeStyles();
  const { data } = useGetCompanyInfoQuery();
  const [failed, setFailed] = useState(false);
  const source = data?.logo_url ? resolvePublicAssetUrl(data.logo_url) : "";
  const [uri, setUri] = useState("");

  useEffect(() => {
    setFailed(false);
    if (!source) {
      setUri("");
      return;
    }
    if (!source.startsWith("data:")) {
      setUri(source);
      return;
    }
    try {
      setUri(fileUriForDataImage(source));
    } catch {
      setUri(source);
    }
  }, [source]);

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, { width: size, height: size, borderRadius: size * 0.28 }]}>
        <Ionicons name="business" size={size * 0.5} color={colors.primary} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      accessibilityLabel="Company logo"
      resizeMode="contain"
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: colors.card }}
    />
  );
}

export function HeaderBack() {
  const { colors, styles } = useChromeStyles();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={12}
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}
      style={styles.back}
    >
      <Ionicons name="chevron-back" size={28} color={colors.text} />
    </Pressable>
  );
}

export function useChildStackOptions() {
  const colors = useThemeColors();
  return useMemo(
    () => ({
      headerStyle: { backgroundColor: colors.card },
      headerTintColor: colors.text,
      headerTitleStyle: { color: colors.text, fontWeight: "700" as const },
      headerShadowVisible: false,
      contentStyle: { backgroundColor: colors.bg },
      headerBackVisible: false,
      headerLeft: () => <HeaderBack />,
      headerRight: () => (
        <View style={{ paddingRight: 12 }}>
          <CompanyLogo size={28} />
        </View>
      ),
    }),
    [colors],
  );
}
