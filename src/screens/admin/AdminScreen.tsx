import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

interface AdminScreenProps {
  user: AuthUser;
}

type InternalTab = "dashboard" | "reports" | "users" | "posts";

const INTERNAL_TABS: { key: InternalTab; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { key: "dashboard", label: "Tổng quan", icon: "bar-chart-2" },
  { key: "reports",   label: "Báo cáo",   icon: "flag" },
  { key: "users",     label: "Người dùng", icon: "users" },
  { key: "posts",     label: "Bài đăng",  icon: "file-text" },
];

const STATUS_LABEL: Record<string, string> = {
  PENDING:       "Chờ xử lý",
  pending:       "Chờ xử lý",
  IN_REVIEW:     "Đang xem",
  in_review:     "Đang xem",
  reviewed:      "Đã xem",
  RESOLVED:      "Đã xử lý",
  resolved:      "Đã xử lý",
  REJECTED:      "Từ chối",
  rejected:      "Từ chối",
  action_taken:  "Đã hành động",
};

const ACCOUNT_LABEL: Record<string, string> = {
  active:      "Hoạt động",
  warning:     "Cảnh cáo",
  restricted:  "Hạn chế",
  temp_locked: "Tạm khóa",
  locked:      "Đã khóa",
  hidden:      "Đã ẩn",
  deleted:     "Đã xóa",
};

const TYPE_LABEL: Record<string, string> = {
  post:    "Bài viết",
  user:    "Tài khoản",
  comment: "Bình luận",
  message: "Tin nhắn",
};

const ROLE_LABEL: Record<string, string> = {
  admin:     "Admin",
  moderator: "Kiểm duyệt",
  user:      "Người dùng",
};

function statusColor(s: string): string {
  const norm = (s || "").toLowerCase();
  if (norm.includes("pending") || norm === "chờ xử lý") return "#d97706";
  if (norm.includes("review") || norm === "đang xem") return "#0052ce";
  if (norm.includes("resolved") || norm === "đã xử lý") return "#16a34a";
  if (norm.includes("reject") || norm === "từ chối") return "#dc2626";
  return "#7e8592";
}

function accountColor(s: string): string {
  if (s === "active") return "#16a34a";
  if (s === "warning") return "#d97706";
  if (["restricted", "temp_locked", "locked"].includes(s)) return "#dc2626";
  return "#7e8592";
}

// ── Metric card ───────────────────────────────────────────────────────────────
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

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: color + "20", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
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
      const res = await api.adminDashboard();
      setStats(res.stats || {});
      setReports((res.recentReports || []).slice(0, 10));
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
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Số liệu hệ thống</Text>
          <View className="flex-row mb-1">
            <MetricCard label="Người dùng" value={stats.totalUsers} icon="users" />
            <MetricCard label="Bài viết" value={stats.totalPosts} icon="file-text" />
          </View>
          <View className="flex-row mb-4">
            <MetricCard label="Báo cáo chờ" value={stats.pendingReports} icon="alert-triangle" />
            <MetricCard label="Audit events" value={stats.systemActivities} icon="activity" />
          </View>
          <Text className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Báo cáo gần đây</Text>
        </View>
      )}
      renderItem={({ item }) => {
        const status = String(item.status || "pending");
        const label = STATUS_LABEL[status] || status;
        const color = statusColor(status);
        const type = TYPE_LABEL[String(item.targetType || item.type || "")] || String(item.targetType || item.type || "");
        return (
          <View className="mx-4 mb-2 bg-surface rounded-2xl p-3 shadow-sm flex-row items-center">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                {type || "Báo cáo"} #{String(item.id || "").slice(0, 8)}
              </Text>
              <Text className="text-xs text-muted-foreground mt-0.5" numberOfLines={1}>
                {String(item.reason || item.details || "")}
              </Text>
            </View>
            <StatusBadge label={label} color={color} />
          </View>
        );
      }}
      ListEmptyComponent={<EmptyState icon="📋" title="Chưa có báo cáo nào" />}
      contentContainerStyle={{ paddingBottom: 100 }}
    />
  );
}

// ── Reports tab ───────────────────────────────────────────────────────────────
const REPORT_FILTERS = [
  { key: "all",      label: "Tất cả" },
  { key: "PENDING",  label: "Chờ xử lý" },
  { key: "IN_REVIEW", label: "Đang xem" },
  { key: "RESOLVED", label: "Đã xử lý" },
];

function ReportsTab() {
  const [filter, setFilter] = useState("all");
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const load = useCallback(async (f = filter) => {
    try {
      const res = await api.adminReports(f === "all" ? undefined : f);
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

// ── Users tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

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

  const filtered = users.filter((u) => {
    if (!keyword.trim()) return true;
    const q = keyword.toLowerCase();
    return [u.fullName, u.email, u.phone, String(u.id)].join(" ").toLowerCase().includes(q);
  });

  const handleUserAction = useCallback((item: any) => {
    const id = Number(item.id);
    const isLocked = ["locked", "temp_locked", "restricted"].includes(String(item.accountStatus));
    const options: any[] = [];

    if (!isLocked) {
      options.push({
        text: "Khóa tài khoản",
        style: "destructive",
        onPress: () => {
          Alert.alert("Xác nhận", `Khóa tài khoản "${item.fullName}"?`, [
            { text: "Hủy", style: "cancel" },
            {
              text: "Khóa",
              style: "destructive",
              onPress: async () => {
                setActionLoading((p) => ({ ...p, [id]: true }));
                try {
                  await api.updateModerationUser(id, { accountStatus: "locked" });
                  load();
                } catch { /* silent */ } finally {
                  setActionLoading((p) => ({ ...p, [id]: false }));
                }
              },
            },
          ]);
        },
      });
    } else {
      options.push({
        text: "Mở khóa",
        onPress: async () => {
          setActionLoading((p) => ({ ...p, [id]: true }));
          try {
            await api.updateModerationUser(id, { accountStatus: "active" });
            load();
          } catch { /* silent */ } finally {
            setActionLoading((p) => ({ ...p, [id]: false }));
          }
        },
      });
    }

    options.push({
      text: "Xóa tài khoản",
      style: "destructive",
      onPress: () => {
        Alert.alert("Xác nhận", `Xóa vĩnh viễn tài khoản "${item.fullName}"?`, [
          { text: "Hủy", style: "cancel" },
          {
            text: "Xóa",
            style: "destructive",
            onPress: async () => {
              setActionLoading((p) => ({ ...p, [id]: true }));
              try {
                await api.deleteAdminUser(id);
                load();
              } catch { /* silent */ } finally {
                setActionLoading((p) => ({ ...p, [id]: false }));
              }
            },
          },
        ]);
      },
    });

    options.push({ text: "Hủy", style: "cancel" });
    Alert.alert(item.fullName || `User #${id}`, `${ROLE_LABEL[item.role] || item.role} · ${ACCOUNT_LABEL[item.accountStatus] || item.accountStatus}`, options);
  }, [load]);

  return (
    <View className="flex-1">
      <View className="px-4 pt-3 pb-2">
        <View className="flex-row items-center bg-surface border border-border rounded-xl px-3">
          <Feather name="search" size={16} color="#7e8592" />
          <TextInput
            value={keyword}
            onChangeText={setKeyword}
            placeholder="Tìm theo tên, email, ID..."
            placeholderTextColor="#7e8592"
            className="flex-1 ml-2 py-2.5 text-sm text-foreground"
          />
          {keyword.length > 0 && (
            <TouchableOpacity onPress={() => setKeyword("")}>
              <Feather name="x" size={16} color="#7e8592" />
            </TouchableOpacity>
          )}
        </View>
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0052ce" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => {
            const initials = String(item.fullName || "U").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
            const acColor = accountColor(String(item.accountStatus || "active"));
            const acLabel = ACCOUNT_LABEL[String(item.accountStatus)] || String(item.accountStatus || "");
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
                <View className="items-end gap-1">
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#0052ce" />
                  ) : (
                    <>
                      <StatusBadge label={ROLE_LABEL[item.role] || item.role || "user"} color="#0052ce" />
                      <StatusBadge label={acLabel} color={acColor} />
                    </>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<EmptyState icon="👥" title="Không tìm thấy người dùng" />}
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

// ── Posts tab ─────────────────────────────────────────────────────────────────
const POST_FILTERS = [
  { key: "all",       label: "Tất cả" },
  { key: "published", label: "Hiển thị" },
  { key: "hidden",    label: "Đã ẩn" },
];

function PostsTab() {
  const [filter, setFilter] = useState("all");
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});

  const load = useCallback(async (f = filter) => {
    try {
      const res = await api.adminPosts(f !== "all" ? { status: f } : undefined);
      setPosts(res.posts || []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { setLoading(true); load(filter); }, [filter]);

  const handlePostAction = useCallback((item: any) => {
    const id = Number(item.id);
    const isHidden = String(item.status || "").toLowerCase() === "hidden";
    Alert.alert(
      "Hành động bài đăng",
      String(item.content || item.body || "").slice(0, 80) || `Bài #${id}`,
      [
        {
          text: isHidden ? "Khôi phục bài" : "Ẩn bài viết",
          onPress: async () => {
            setActionLoading((p) => ({ ...p, [id]: true }));
            try {
              await api.updateAdminPost(id, { status: isHidden ? "published" : "hidden" });
              load(filter);
            } catch { /* silent */ } finally {
              setActionLoading((p) => ({ ...p, [id]: false }));
            }
          },
        },
        {
          text: "Xóa bài viết",
          style: "destructive",
          onPress: () => {
            Alert.alert("Xác nhận", "Xóa vĩnh viễn bài viết này?", [
              { text: "Hủy", style: "cancel" },
              {
                text: "Xóa",
                style: "destructive",
                onPress: async () => {
                  setActionLoading((p) => ({ ...p, [id]: true }));
                  try {
                    await api.deleteAdminPost(id);
                    load(filter);
                  } catch { /* silent */ } finally {
                    setActionLoading((p) => ({ ...p, [id]: false }));
                  }
                },
              },
            ]);
          },
        },
        { text: "Hủy", style: "cancel" },
      ],
    );
  }, [filter, load]);

  return (
    <View className="flex-1">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4 pt-3 pb-2" style={{ flexGrow: 0 }}>
        {POST_FILTERS.map((f) => (
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
          data={posts}
          keyExtractor={(item, i) => String(item.id || i)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(filter); }} />}
          renderItem={({ item }) => {
            const status = String(item.status || "published").toLowerCase();
            const isHidden = status === "hidden";
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
                      {item.author?.displayName || item.authorName || `User #${item.authorId || ""}`}
                    </Text>
                    <Text className="text-sm text-foreground" numberOfLines={2}>
                      {String(item.content || item.body || "").slice(0, 120) || "(Bài đăng không có nội dung)"}
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
                    <StatusBadge label={isHidden ? "Đã ẩn" : "Hiển thị"} color={isHidden ? "#dc2626" : "#16a34a"} />
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={<EmptyState icon="📝" title="Không có bài đăng" />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

// ── AdminScreen root ──────────────────────────────────────────────────────────
export function AdminScreen({ user }: AdminScreenProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<InternalTab>("dashboard");

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard": return <DashboardTab />;
      case "reports":   return <ReportsTab />;
      case "users":     return <UsersTab />;
      case "posts":     return <PostsTab />;
    }
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="px-4 pt-3 pb-2 bg-surface border-b border-border flex-row items-center">
        <View className="w-8 h-8 rounded-full bg-primary items-center justify-center mr-3">
          <Feather name="shield" size={16} color="#fff" />
        </View>
        <View>
          <Text className="text-base font-bold text-foreground">Quản trị viên</Text>
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
              <Feather name={tab.icon} size={18} color={isActive ? "#0052ce" : "#7e8592"} />
              <Text
                className="text-[10px] font-semibold mt-1"
                style={{ color: isActive ? "#0052ce" : "#7e8592" }}
              >
                {tab.label}
              </Text>
              {isActive && (
                <View className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full" />
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
