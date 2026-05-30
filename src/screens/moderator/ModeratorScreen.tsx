import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../components/common/EmptyState";
import { api } from "../../lib";
import type { AuthUser } from "../../types";

interface ModeratorScreenProps {
  user: AuthUser;
}

type InternalTab = "dashboard" | "reports" | "posts" | "users";

const INTERNAL_TABS: { key: InternalTab; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { key: "dashboard", label: "Tổng quan", icon: "bar-chart-2" },
  { key: "reports",   label: "Báo cáo",   icon: "flag" },
  { key: "posts",     label: "Bài đăng",  icon: "file-text" },
  { key: "users",     label: "Người dùng", icon: "users" },
];

const STATUS_LABEL: Record<string, string> = {
  PENDING:      "Chờ xử lý",
  pending:      "Chờ xử lý",
  IN_REVIEW:    "Đang xem",
  in_review:    "Đang xem",
  reviewed:     "Đã xem",
  RESOLVED:     "Đã xử lý",
  resolved:     "Đã xử lý",
  REJECTED:     "Từ chối",
  rejected:     "Từ chối",
  action_taken: "Đã hành động",
};

const TYPE_LABEL: Record<string, string> = {
  post:    "Bài viết",
  user:    "Tài khoản",
  comment: "Bình luận",
  message: "Tin nhắn",
};

const ACCOUNT_LABEL: Record<string, string> = {
  active:      "Hoạt động",
  warning:     "Cảnh cáo",
  restricted:  "Hạn chế",
  temp_locked: "Tạm khóa",
  locked:      "Đã khóa",
  deleted:     "Đã xóa",
};

function statusColor(s: string): string {
  const norm = (s || "").toLowerCase();
  if (norm.includes("pending")) return "#d97706";
  if (norm.includes("review"))  return "#0052ce";
  if (norm.includes("resolved") || norm.includes("action")) return "#16a34a";
  if (norm.includes("reject"))  return "#dc2626";
  return "#7e8592";
}

function accountColor(s: string): string {
  if (s === "active") return "#16a34a";
  if (s === "warning") return "#d97706";
  if (["restricted", "temp_locked", "locked"].includes(s)) return "#dc2626";
  return "#7e8592";
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + "20", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function MetricCard({ label, value, icon }: { label: string; value?: number; icon: React.ComponentProps<typeof Feather>["name"] }) {
  return (
    <View className="flex-1 bg-surface rounded-2xl p-4 m-1 shadow-sm">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-xs text-muted-foreground font-medium">{label}</Text>
        <Feather name={icon} size={14} color="#7e8592" />
      </View>
      <Text className="text-2xl font-bold text-foreground">
        {value !== undefined ? value.toLocaleString() : "–"}
      </Text>
    </View>
  );
}

// ── Reason input modal (cross-platform alternative to Alert.prompt) ────────────
interface ReasonModalProps {
  visible: boolean;
  title: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function ReasonModal({ visible, title, onConfirm, onCancel }: ReasonModalProps) {
  const [reason, setReason] = useState("");
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View className="flex-1 justify-center items-center" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View className="bg-surface rounded-2xl p-5 mx-6 w-full" style={{ maxWidth: 360 }}>
          <Text className="text-base font-bold text-foreground mb-3">{title}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Lý do (tùy chọn)..."
            placeholderTextColor="#7e8592"
            className="bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground mb-4"
            multiline
            numberOfLines={3}
            autoFocus
          />
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={onCancel}
              className="flex-1 bg-background border border-border rounded-xl py-3 items-center"
            >
              <Text className="text-sm font-semibold text-muted-foreground">Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { onConfirm(reason); setReason(""); }}
              className="flex-1 bg-primary rounded-xl py-3 items-center"
            >
              <Text className="text-sm font-semibold text-white">Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────
function DashboardTab() {
  const [stats, setStats] = useState<Record<string, number>>({});
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.moderationDashboard();
      setStats(res.stats || {});
      setReports((res.reports || []).slice(0, 10));
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#0052ce" />
      </View>
    );
  }

  return (
    <FlatList
      data={reports}
      keyExtractor={(_, i) => String(i)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={() => (
        <View className="px-4 pt-4">
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Hàng đợi kiểm duyệt</Text>
          <View className="flex-row mb-1">
            <MetricCard label="Báo cáo chờ" value={stats.pendingReports ?? stats.totalPending} icon="alert-triangle" />
            <MetricCard label="Đã xử lý" value={stats.resolvedReports ?? stats.totalResolved} icon="check-circle" />
          </View>
          <View className="flex-row mb-4">
            <MetricCard label="Bài bị báo" value={stats.reportedPosts} icon="file-text" />
            <MetricCard label="User bị báo" value={stats.reportedUsers} icon="user-x" />
          </View>
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Báo cáo gần đây</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const status = String(item.status || "PENDING");
        const label = STATUS_LABEL[status] || status;
        const color = statusColor(status);
        const type = TYPE_LABEL[String(item.targetType || item.type || "")] || String(item.targetType || item.type || "");
        return (
          <View className="mx-4 mb-2 bg-surface rounded-2xl p-3 shadow-sm flex-row items-center">
            <View className="flex-1 mr-2">
              <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                {type || "Báo cáo"} · #{String(item.id || "").slice(0, 8)}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                {String(item.reason || item.details || "")}
              </Text>
            </View>
            <StatusBadge label={label} color={color} />
          </View>
        );
      }}
      ListEmptyComponent={<EmptyState icon="✅" title="Không có báo cáo mới" subtitle="Hàng đợi kiểm duyệt trống." />}
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}

// ── Reports tab ───────────────────────────────────────────────────────────────
const REPORT_FILTERS = [
  { key: "all",       label: "Tất cả" },
  { key: "PENDING",   label: "Chờ" },
  { key: "IN_REVIEW", label: "Đang xem" },
  { key: "RESOLVED",  label: "Đã xử lý" },
];

function ReportsTab() {
  const [filter, setFilter] = useState("all");
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const load = useCallback(async (f = filter) => {
    try {
      const res = await api.moderationReports(f === "all" ? undefined : f);
      setReports(res.reports || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { setLoading(true); load(filter); }, [filter]);

  const handleAction = useCallback((item: any) => {
    const id = Number(item.id);
    Alert.alert(
      `Báo cáo #${String(item.id || "").slice(0, 8)}`,
      String(item.reason || item.details || ""),
      [
        {
          text: "Đang xem xét",
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [id]: true }));
            try {
              await api.reviewModerationReport(id, { status: "IN_REVIEW" });
              load(filter);
            } catch { /* silent */ } finally {
              setActionLoading((p) => ({ ...p, [id]: false }));
            }
          },
        },
        {
          text: "Đã xử lý",
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [id]: true }));
            try {
              await api.reviewModerationReport(id, { status: "RESOLVED" });
              load(filter);
            } catch { /* silent */ } finally {
              setActionLoading((p) => ({ ...p, [id]: false }));
            }
          },
        },
        {
          text: "Từ chối",
          style: "destructive",
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [id]: true }));
            try {
              await api.reviewModerationReport(id, { status: "REJECTED" });
              load(filter);
            } catch { /* silent */ } finally {
              setActionLoading((p) => ({ ...p, [id]: false }));
            }
          },
        },
        { text: "Hủy", style: "cancel" },
      ],
    );
  }, [filter, load]);

  return (
    <View className="flex-1">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pt-3 pb-2" style={{ flexGrow: 0 }}>
        {REPORT_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setFilter(f.key)}
            className={`mr-2 px-4 py-2 rounded-full border ${filter === f.key ? "bg-primary border-primary" : "bg-surface border-border"}`}
          >
            <Text className={`text-xs font-semibold ${filter === f.key ? "text-white" : "text-muted-foreground"}`}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0052ce" />
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item, i) => String(item.id || i)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(filter); }} />}
          renderItem={({ item }) => {
            const status = String(item.status || "PENDING");
            const label = STATUS_LABEL[status] || status;
            const color = statusColor(status);
            const type = TYPE_LABEL[String(item.targetType || item.type || "")] || String(item.targetType || item.type || "Báo cáo");
            const isLoading = actionLoading[Number(item.id)];
            return (
              <TouchableOpacity
                onPress={() => handleAction(item)}
                activeOpacity={0.7}
                className="mx-4 mb-2 bg-surface rounded-2xl p-4 shadow-sm"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                      {type} · #{String(item.id || "").slice(0, 8)}
                    </Text>
                    <Text className="text-xs text-muted-foreground mt-1" numberOfLines={2}>
                      {String(item.reason || item.details || "Không có lý do")}
                    </Text>
                    {item.createdAt ? (
                      <Text className="text-[10px] text-muted-foreground mt-1">
                        {new Date(String(item.createdAt)).toLocaleDateString("vi-VN")}
                      </Text>
                    ) : null}
                  </View>
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#0052ce" />
                  ) : (
                    <StatusBadge label={label} color={color} />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<EmptyState icon="🚩" title="Không có báo cáo" subtitle="Không tìm thấy báo cáo nào với bộ lọc hiện tại." />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

// ── Posts tab ─────────────────────────────────────────────────────────────────
function PostsTab() {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    try {
      const res = await api.moderationReports("all");
      // Filter to post-type reports only
      const postReports = (res.reports || []).filter((r: any) =>
        String(r.targetType || r.type || "").toLowerCase() === "post",
      );
      setPosts(postReports);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePostAction = useCallback((item: any) => {
    const postId = Number(item.targetId || item.postId || item.id);
    const reportId = Number(item.id);
    Alert.alert(
      "Kiểm duyệt bài viết",
      String(item.reason || item.details || `Bài #${postId}`),
      [
        {
          text: "Ẩn bài viết",
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [reportId]: true }));
            try {
              await api.moderatePost(postId, { status: "hidden", action: "hide", resolution: "Ẩn theo yêu cầu kiểm duyệt" });
              await api.reviewModerationReport(reportId, { status: "RESOLVED", resolution: "Đã ẩn bài viết" });
              load();
            } catch { /* silent */ } finally {
              setActionLoading((p) => ({ ...p, [reportId]: false }));
            }
          },
        },
        {
          text: "Từ chối báo cáo",
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [reportId]: true }));
            try {
              await api.reviewModerationReport(reportId, { status: "REJECTED", resolution: "Báo cáo không hợp lệ" });
              load();
            } catch { /* silent */ } finally {
              setActionLoading((p) => ({ ...p, [reportId]: false }));
            }
          },
        },
        { text: "Hủy", style: "cancel" },
      ],
    );
  }, [load]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#0052ce" />
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(item, i) => String(item.id || i)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      renderItem={({ item }) => {
        const status = String(item.status || "PENDING");
        const label = STATUS_LABEL[status] || status;
        const color = statusColor(status);
        const isLoading = actionLoading[Number(item.id)];
        return (
          <TouchableOpacity
            onPress={() => handlePostAction(item)}
            activeOpacity={0.7}
            className="mx-4 mb-2 bg-surface rounded-2xl p-4 shadow-sm"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-2">
                <Text className="text-xs text-muted-foreground mb-1">
                  Bài viết #{String(item.targetId || item.postId || "").slice(0, 8)}
                </Text>
                <Text className="text-sm text-foreground" numberOfLines={2}>
                  {String(item.reason || item.details || "Bị báo cáo")}
                </Text>
                {item.createdAt ? (
                  <Text className="text-[10px] text-muted-foreground mt-1">
                    {new Date(String(item.createdAt)).toLocaleDateString("vi-VN")}
                  </Text>
                ) : null}
              </View>
              {isLoading ? (
                <ActivityIndicator size="small" color="#0052ce" />
              ) : (
                <StatusBadge label={label} color={color} />
              )}
            </View>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={<EmptyState icon="📝" title="Không có bài đăng bị báo cáo" />}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
    />
  );
}

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [reasonModal, setReasonModal] = useState<{
    visible: boolean;
    title: string;
    onConfirm: (reason: string) => Promise<void>;
  }>({ visible: false, title: "", onConfirm: async () => {} });

  const load = useCallback(async () => {
    try {
      const res = await api.adminModerationUsers();
      setUsers(res.users || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openReasonModal = useCallback(
    (title: string, onConfirm: (reason: string) => Promise<void>) => {
      if (Platform.OS === "ios") {
        Alert.prompt(title, "Nhập lý do (tùy chọn)", async (reason) => {
          await onConfirm(reason || "");
        });
      } else {
        setReasonModal({ visible: true, title, onConfirm });
      }
    },
    [],
  );

  const handleUserAction = useCallback((item: any) => {
    const id = Number(item.id);
    const status = String(item.accountStatus || "active");
    const isRestricted = ["restricted", "temp_locked", "locked", "warning"].includes(status);

    const options: any[] = [];

    if (!isRestricted || status === "active") {
      options.push({
        text: "Cảnh cáo",
        onPress: () =>
          openReasonModal(`Cảnh cáo "${item.fullName}"`, async (reason) => {
            setActionLoading((p) => ({ ...p, [id]: true }));
            try {
              await api.warnModerationUser(id, reason || undefined);
              load();
            } catch { /* silent */ } finally {
              setActionLoading((p) => ({ ...p, [id]: false }));
            }
          }),
      });
      options.push({
        text: "Hạn chế",
        onPress: () =>
          openReasonModal(`Hạn chế tài khoản "${item.fullName}"`, async (reason) => {
            setActionLoading((p) => ({ ...p, [id]: true }));
            try {
              await api.restrictModerationUser(id, reason || undefined);
              load();
            } catch { /* silent */ } finally {
              setActionLoading((p) => ({ ...p, [id]: false }));
            }
          }),
      });
      options.push({
        text: "Tạm khóa",
        style: "destructive",
        onPress: () =>
          openReasonModal(`Tạm khóa "${item.fullName}"`, async (reason) => {
            setActionLoading((p) => ({ ...p, [id]: true }));
            try {
              await api.tempLockModerationUser(id, reason || undefined);
              load();
            } catch { /* silent */ } finally {
              setActionLoading((p) => ({ ...p, [id]: false }));
            }
          }),
      });
    }

    if (isRestricted) {
      options.push({
        text: "Khôi phục",
        onPress: async () => {
          setActionLoading((p) => ({ ...p, [id]: true }));
          try {
            await api.restoreModerationUser(id);
            load();
          } catch { /* silent */ } finally {
            setActionLoading((p) => ({ ...p, [id]: false }));
          }
        },
      });
    }

    options.push({ text: "Hủy", style: "cancel" });

    Alert.alert(
      item.fullName || `User #${id}`,
      `${ACCOUNT_LABEL[status] || status}`,
      options,
    );
  }, [load, openReasonModal]);

  return (
    <View className="flex-1">
      <ReasonModal
        visible={reasonModal.visible}
        title={reasonModal.title}
        onConfirm={async (reason) => {
          setReasonModal((p) => ({ ...p, visible: false }));
          await reasonModal.onConfirm(reason);
        }}
        onCancel={() => setReasonModal((p) => ({ ...p, visible: false }))}
      />
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0052ce" />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => {
            const status = String(item.accountStatus || "active");
            const acColor = accountColor(status);
            const acLabel = ACCOUNT_LABEL[status] || status;
            const initials = String(item.fullName || "U").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
            const isLoading = actionLoading[Number(item.id)];
            return (
              <TouchableOpacity
                onPress={() => handleUserAction(item)}
                activeOpacity={0.7}
                className="mx-4 mb-2 bg-surface rounded-2xl p-3 shadow-sm flex-row items-center"
              >
                <View
                  className="w-10 h-10 rounded-full items-center justify-center mr-3"
                  style={{ backgroundColor: "#0052ce22" }}
                >
                  <Text className="text-sm font-bold text-primary">{initials}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>{item.fullName}</Text>
                  <Text className="text-xs text-muted-foreground" numberOfLines={1}>{item.email || item.phone || `#${item.id}`}</Text>
                </View>
                {isLoading ? (
                  <ActivityIndicator size="small" color="#0052ce" />
                ) : (
                  <StatusBadge label={acLabel} color={acColor} />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<EmptyState icon="👥" title="Không có người dùng" />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

// ── ModeratorScreen root ──────────────────────────────────────────────────────
export function ModeratorScreen({ user }: ModeratorScreenProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<InternalTab>("dashboard");

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard": return <DashboardTab />;
      case "reports":   return <ReportsTab />;
      case "posts":     return <PostsTab />;
      case "users":     return <UsersTab />;
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-4 pt-3 pb-2 bg-surface border-b border-border flex-row items-center">
        <View className="w-8 h-8 rounded-full items-center justify-center mr-3" style={{ backgroundColor: "#16a34a22" }}>
          <Feather name="shield" size={16} color="#16a34a" />
        </View>
        <View>
          <Text className="text-base font-bold text-foreground">Kiểm duyệt viên</Text>
          <Text className="text-[11px] text-muted-foreground">{user.fullName}</Text>
        </View>
      </View>

      {/* Internal tab bar */}
      <View className="bg-surface border-b border-border flex-row">
        {INTERNAL_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className="flex-1 items-center py-3"
              activeOpacity={0.7}
            >
              <Feather name={tab.icon} size={18} color={isActive ? "#16a34a" : "#7e8592"} />
              <Text
                className="text-[10px] font-semibold mt-1"
                style={{ color: isActive ? "#16a34a" : "#7e8592" }}
              >
                {tab.label}
              </Text>
              {isActive && (
                <View className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full" style={{ backgroundColor: "#16a34a" }} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      <View className="flex-1">
        {renderContent()}
      </View>
    </View>
  );
}
