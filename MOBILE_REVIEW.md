# ZChat Mobile — Review Kỹ Thuật Toàn Diện

> Phiên bản review: 2026-05-30  
> Codebase: `soccial-media-app/` — Expo + React Native  
> Đối chiếu với bản web: `soccial-media-web/`

---

## 1. Stack Công Nghệ

### 1.1 Core Framework

| Thành phần | Công nghệ | Version | Ghi chú |
|------------|-----------|---------|---------|
| Runtime framework | Expo | 54.0.34 | SDK 54, New Architecture bật |
| UI framework | React Native | 0.81.5 | New Architecture (JSI/Fabric) |
| Ngôn ngữ | TypeScript | ~5.9.2 | Strict mode |
| React | React | 19.1.0 | Concurrent features |
| Bundler | Metro | (qua Expo) | NativeWind integration |
| Build service | EAS (Expo Application Services) | — | Project ID: 4e232d64 |

### 1.2 UI & Styling

| Thành phần | Công nghệ | Version | Ghi chú |
|------------|-----------|---------|---------|
| Styling | NativeWind | ^5.0.0-preview.3 | Tailwind CSS cho React Native |
| CSS processor | Tailwind CSS v4 | ^4.2.2 | Config tại `tailwind.config.ts` |
| PostCSS | @tailwindcss/postcss | ^4.2.2 | Pipeline CSS |
| Icons | @expo/vector-icons (Feather) | ^15.0.3 | Bộ icon Feather |
| Animation | react-native-reanimated | ~4.1.1 | Worklet-based animations |
| Worklets | react-native-worklets | ^0.5.1 | Hỗ trợ JS worklets |

### 1.3 Navigation

**Approach:** Custom state-machine navigation trong `App.tsx` (không dùng React Navigation hay Expo Router).

- Không có router library — điều hướng bằng `activeTab` state + `switch/case`
- 6 tab chính: feed, search, messages, friends, notifications, profile
- 3 màn hình modal/phụ: user-profile, profile-settings, ai-chat
- Ưu điểm: đơn giản, không overhead; nhược điểm: không có deep linking, không có back stack

### 1.4 Realtime & Network

| Thành phần | Công nghệ | Version | Ghi chú |
|------------|-----------|---------|---------|
| WebSocket | socket.io-client | ^4.8.1 | Kết nối với backend NestJS |
| HTTP client | Fetch API | native | Không dùng axios |
| Token refresh | Custom | — | `src/lib/api.ts` |
| Local storage | AsyncStorage | ^2.2.0 | Lưu JWT tokens |
| Media picker | expo-image-picker | ^17.0.11 | Camera + gallery |
| File picker | expo-document-picker | ~14.0.8 | Chọn file gửi chat |

### 1.5 State Management

**Không dùng Redux, Zustand, hay Jotai.** Toàn bộ state được quản lý bằng:
- `useState` + `useCallback` trong `App.tsx` (global state: user, activeTab, routing)
- `useState` cục bộ trong từng Screen
- `AsyncStorage` qua `authStore` singleton để persist JWT tokens
- `authStore` pattern: in-memory cache + lazy hydration từ AsyncStorage

### 1.6 Video Call

**Approach:** Jitsi Meet qua `Linking.openURL` — không dùng WebRTC native.

```
User A bấm 📹 → emit call:offer (Socket.IO) → User B nhận modal
User B chấp nhận → emit call:answer → cả 2 mở https://meet.jit.si/{roomId}
```

Ưu điểm: không cần `react-native-webrtc`, tương thích New Architecture, zero setup  
Nhược điểm: rời app để gọi, không control được UI cuộc gọi

---

## 2. Cấu Trúc Thư Mục & Phân Bố Tính Năng

```
soccial-media-app/
├── App.tsx                    # Entry point + global state machine
├── app.json                   # Expo config (permissions, bundle ID)
├── eas.json                   # Build profiles (dev/preview/production)
├── tailwind.config.ts         # Color tokens, theme
├── metro.config.js            # Metro + NativeWind pipeline
├── babel.config.js            # babel-preset-expo
├── src/
│   ├── global.css             # Tailwind directives
│   ├── lib/
│   │   ├── api.ts             # API client (1143 dòng, 80+ endpoints)
│   │   ├── auth.ts            # authStore: token persistence
│   │   ├── socket.ts          # Socket.IO singleton
│   │   └── service-url.ts     # URL normalization helper
│   ├── navigation/
│   │   └── AppNavigator.tsx   # Bottom tab bar (6 tabs)
│   ├── screens/
│   │   ├── AuthScreen.tsx              # Đăng nhập / Đăng ký / OTP
│   │   ├── FeedScreen.tsx              # Bảng tin xã hội
│   │   ├── MessagesScreen.tsx          # Chat 1-1 & nhóm (màn hình lớn nhất)
│   │   ├── FriendsScreen.tsx           # Quản lý bạn bè
│   │   ├── NotificationsScreen.tsx     # Thông báo
│   │   ├── SearchScreen.tsx            # Tìm kiếm user & bài đăng
│   │   ├── AIChatScreen.tsx            # Trợ lý AI
│   │   ├── MyProfileScreen.tsx         # Profile của mình
│   │   ├── UserProfileScreen.tsx       # Profile người khác
│   │   ├── ProfileScreen.tsx           # Cài đặt & chỉnh sửa profile
│   │   ├── friends/                    # Sub-module Friends
│   │   │   ├── components/             # 8 components: FriendRow, PendingRequestRow...
│   │   │   ├── hooks/useFriendsData.ts # Data fetching hook
│   │   │   ├── types.ts
│   │   │   └── helpers.ts
│   │   └── messages/                   # Sub-module Messages compose
│   │       ├── components/ComposeConversationModal.tsx
│   │       └── hooks/useConversationCompose.ts
│   ├── components/
│   │   ├── common/             # Avatar, Button, Card, Input, Loading,
│   │   │   └── (10 files)      # EmptyState, Toast, TopBar, TabBar, DatePickerField
│   │   ├── feed/               # PostCard, PostComposer, CommentModal,
│   │   │   └── (4 files)       # PostCommentsScreen
│   │   ├── chat/               # ConversationItem, MessageBubble, MessageInput,
│   │   │   └── (4 files)       # MediaGalleryModal
│   │   ├── notifications/      # NotificationItem
│   │   └── search/             # SearchBar, UserResultItem
│   ├── types/
│   │   ├── auth.ts             # AuthUser, AuthTokens, payloads
│   │   ├── post.ts             # FeedPost, FeedComment, CreatePostPayload
│   │   ├── conversation.ts     # Conversation, Message, SendMessagePayload
│   │   └── notification.ts     # Notification
│   └── utils/
│       ├── formatters.ts       # Date, text, number formatting
│       └── theme.ts            # Theme utilities
```

---

## 3. Phân Bố Tính Năng Theo Màn Hình

### 3.1 AuthScreen (`screens/AuthScreen.tsx`)
- Đăng nhập bằng email/phone + mật khẩu
- Đăng ký tài khoản mới
- Xác thực OTP email (resend countdown)
- Quên mật khẩu + reset qua email
- Auto-focus OTP input
- Realtime password mismatch validation

### 3.2 FeedScreen (`screens/FeedScreen.tsx`)
- Danh sách bài đăng (pull-to-refresh)
- Tạo bài đăng mới (`PostComposer`)
- React / bình luận / chia sẻ (`PostCard`)
- Upload ảnh/video vào bài đăng
- Click hashtag → chuyển sang SearchScreen
- Focus vào post cụ thể (deeplink từ Notifications)
- Mở comment sheet trực tiếp (deeplink từ Notifications)
- Nút truy cập AI Chat

### 3.3 MessagesScreen (`screens/MessagesScreen.tsx`) — Màn Hình Lớn Nhất
Đây là màn hình phức tạp nhất, gồm nhiều lớp UI:

**Danh sách hội thoại:**
- List 1-1 và nhóm (realtime qua Socket.IO)
- Tạo hội thoại mới (1-1 + nhóm) qua `ComposeConversationModal`
- Unread badge

**Giao diện chat:**
- Nhắn tin text, gửi file/ảnh/video
- Message bubble (gửi/nhận, timestamp, trạng thái)
- Long-press → Action sheet: Sao chép · React · Chuyển tiếp · Ghim · Thu hồi
- Emoji reaction picker (6 emojis: 👍❤️😆😮😢😡)
- Forward message (chọn hội thoại đích)
- Ghim / bỏ ghim tin nhắn
- Thu hồi tin nhắn

**Quản lý nhóm (từ menu settings):**
- Đổi tên nhóm (modal TextInput)
- Thêm thành viên (search + nút Thêm)
- Xóa thành viên (long-press → Alert)
- Phân quyền leader/deputy (long-press → Alert)
- Rời nhóm / giải tán nhóm

**Shared Media Gallery (`MediaGalleryModal`):**
- 3 tab: Ảnh & Video · Tệp · Liên kết
- Grid 3 cột cho ảnh
- Danh sách cho tệp và link
- Tap để mở bằng `Linking.openURL`

**Video Call:**
- Nút 📹 trong chat header
- Modal "Đang gọi..." (đơi phản hồi)
- Modal "Cuộc gọi đến" (Chấp nhận / Từ chối)
- Socket.IO signaling: `call:offer`, `call:answer`, `call:end`
- Mở Jitsi Meet qua `Linking.openURL`

### 3.4 FriendsScreen (`screens/FriendsScreen.tsx`)
Tổ chức theo sub-module tại `screens/friends/`:
- Tab: Bạn bè · Lời mời · Tìm kiếm
- Gửi / chấp nhận / từ chối lời mời kết bạn
- Xóa bạn bè
- Nhắn tin ngay cho bạn (shortcut → MessagesScreen)
- Xem profile bạn (→ UserProfileScreen)

### 3.5 NotificationsScreen (`screens/NotificationsScreen.tsx`)
- Danh sách thông báo realtime
- Đánh dấu đã đọc / đọc tất cả
- Xóa từng thông báo (nút ✕ + long-press)
- Click thông báo → mở post liên quan

### 3.6 SearchScreen (`screens/SearchScreen.tsx`)
- Tìm kiếm người dùng theo tên/email
- Tìm kiếm bài đăng
- Explore trending posts
- Hashtag filter (nhận `initialQuery` từ FeedScreen)
- Xem profile user từ kết quả

### 3.7 AIChatScreen (`screens/AIChatScreen.tsx`)
- Chat với AI assistant (Google Gemini)
- Lịch sử hội thoại AI
- Tóm tắt đoạn chat
- Gợi ý trả lời
- Dịch thuật tin nhắn
- Nút thoát → quay về tab trước

### 3.8 MyProfileScreen (`screens/MyProfileScreen.tsx`)
- Xem profile cá nhân (avatar, tên, thông tin)
- Danh sách bài đăng của mình
- Nút truy cập cài đặt profile

### 3.9 UserProfileScreen (`screens/UserProfileScreen.tsx`)
- Xem profile người dùng khác
- Nút kết bạn / hủy kết bạn
- Nhắn tin trực tiếp
- Danh sách bài đăng của họ
- Online indicator (dựa vào `lastActiveAt`)

### 3.10 ProfileScreen (`screens/ProfileScreen.tsx`)
- Chỉnh sửa: tên, avatar (camera + gallery), ngày sinh, giới tính
- Đổi mật khẩu
- Cài đặt quyền riêng tư (3 toggle): hiển thị lần cuối hoạt động, ảnh đại diện công khai, cho phép nhận lời mời kết bạn
- Đăng xuất / xóa tài khoản

---

## 4. API Client (`src/lib/api.ts`)

File 1143 dòng, cover 80+ endpoints, tổ chức thành các nhóm:

| Nhóm | Số endpoint | Ghi chú |
|------|-------------|---------|
| Auth | 10 | login, register, OTP, refresh, me, avatar upload |
| Feed / Posts | 9 | CRUD, reaction, share |
| Comments | 5 | CRUD, reaction |
| Messages / Conversations | 12 | CRUD, notifications toggle, leave, dissolve |
| Message Actions | 7 | react, unreact, forward, pin, unpin, recall, upload |
| Group Management | 4 | rename, add/remove member, change role |
| Notifications | 4 | list, mark read, mark all, delete |
| Search / Users | 5 | search users, profile, posts, block/unblock |
| Friends | 6 | list, request, accept, reject, remove, pending |
| Privacy Settings | 2 | get, update |
| AI | 5 | chat, history, summarize, suggest-replies, translate |
| Reports | 1 | submit report |
| Shared Content | 1 | gallery media |

**Token Refresh Flow:**
1. Request → attach Bearer token
2. 401 → gọi `POST /api/auth/refresh` tự động
3. Retry request gốc với token mới
4. Nếu refresh thất bại → clear tokens + redirect về login

---

## 5. Tối Ưu Đã Thực Hiện

### 5.1 New Architecture (Fabric + JSI)
`"newArchEnabled": true` trong `app.json` — kích hoạt toàn bộ New Architecture của React Native 0.81. Ưu điểm:
- JSI: JavaScript gọi trực tiếp native không qua bridge JSON serialize
- Fabric: rendering synchronous, tránh jank khi scroll
- Concurrent React: `useTransition`, `Suspense` hoạt động đúng trên native

### 5.2 Socket.IO Singleton
`src/lib/socket.ts` dùng singleton pattern — chỉ tạo 1 socket connection duy nhất cho cả app, tái sử dụng khi navigate giữa các màn hình. Không tạo lại connection mỗi lần render.

### 5.3 Token Caching In-Memory
`authStore` cache JWT tokens trong biến module-level (không query AsyncStorage mỗi request). AsyncStorage chỉ đọc 1 lần khi app khởi động (`hydrate()`).

### 5.4 Keyboard Dismiss Global
`<TouchableWithoutFeedback onPress={Keyboard.dismiss}>` bao toàn bộ app — tap ngoài input tự dismiss keyboard mà không cần xử lý trong từng màn hình.

### 5.5 useCallback cho Navigation Handlers
Tất cả navigation handlers trong `App.tsx` được wrap bằng `useCallback` với đúng deps — tránh re-render cascade khi state thay đổi.

### 5.6 NativeWind v5 + Tailwind v4
Sử dụng NativeWind preview 5.x với Tailwind v4 — pipeline CSS mới dùng `@tailwindcss/postcss` + `lightningcss` thay vì PostCSS cũ, nhanh hơn đáng kể khi hot reload.

### 5.7 Video Call Không Cần WebRTC Native
Thay vì tích hợp `react-native-webrtc` (không tương thích New Architecture, cần tắt JSI), dùng `Linking.openURL` mở Jitsi Meet. Zero native dependency, không cần custom build.

### 5.8 Base64 Upload
Ảnh/video/file được encode base64 trước khi gửi qua API thay vì dùng `FormData` multipart — tránh lỗi encoding trên một số thiết bị Android và đơn giản hóa retry logic.

### 5.9 EAS Build Profiles
`eas.json` định nghĩa 3 profile:
- `development`: APK với `expo-dev-client`, hot reload đầy đủ
- `preview`: Internal APK distribution để test
- `production`: Android App Bundle cho Play Store

---

## 6. Design System & Theme

`tailwind.config.ts` định nghĩa color tokens nhất quán:

```
primary:    #0052ce   (xanh dương chính)
background: #f3f5f8   (nền ứng dụng)
surface:    #ffffff   (card/panel)
border:     #e5e7eb   (viền)
text:       #1f2733   (text chính)
muted:      #6b7280   (text phụ)
danger:     #dc2626   (đỏ cảnh báo)
success:    #16a34a   (xanh lá thành công)
warning:    #d97706   (vàng cảnh báo)
```

Tất cả component dùng class NativeWind (`className="..."`) thay vì `StyleSheet.create` — nhất quán với codebase và dễ maintain.

---

## 7. Permissions Đã Khai Báo

### Android (`app.json`)
```
CAMERA              — Video call
RECORD_AUDIO        — Audio call
INTERNET            — Network
ACCESS_NETWORK_STATE — Connectivity check
MODIFY_AUDIO_SETTINGS — Speaker/mic control
BLUETOOTH / BLUETOOTH_CONNECT — Tai nghe Bluetooth
```

### iOS (`app.json` > `infoPlist`)
```
NSCameraUsageDescription      — "ZChat cần camera cho video call"
NSMicrophoneUsageDescription  — "ZChat cần microphone cho cuộc gọi"
```

---

## 8. So Sánh Mobile vs Web

| Tính năng | Web (`soccial-media-web`) | Mobile (`soccial-media-app`) |
|-----------|--------------------------|------------------------------|
| Auth | ✅ Đầy đủ + SMS OTP stub | ✅ Đầy đủ (email OTP) |
| Feed | ✅ Đầy đủ | ✅ Đầy đủ |
| Messages realtime | ✅ Socket.IO | ✅ Socket.IO |
| Typing indicator | ✅ | ✅ (sửa 2026-06-01) |
| Read receipts ("Đã xem") | ✅ | ✅ (thêm 2026-06-01) |
| Tìm kiếm tin trong hội thoại | ✅ | ✅ (thêm 2026-06-01) |
| Ghim / Tắt tiếng hội thoại | ✅ | ✅ (thêm 2026-06-01) |
| Xóa lịch sử trò chuyện | ✅ | ✅ (thêm 2026-06-01) |
| Sticker | ✅ packs | ✅ emoji pack (liên thông token) |
| Biệt danh thành viên | ✅ | ✅ (thêm 2026-06-01) |
| Group management (đổi tên/role) | ✅ Inline UI | ✅ Modal UI (sửa role 2026-06-01) |
| Video/Voice call | ✅ WebRTC native | ✅ Jitsi Meet (Linking) |
| AI features | ✅ Đầy đủ 5 tính năng | ✅ Đầy đủ 5 tính năng |
| Media gallery | ✅ Lightbox | ✅ 3-tab modal |
| Theme/Background/Auto-delete hội thoại | ✅ | ❌ Backlog (ít dùng trên mobile) |
| Admin/Moderator | ✅ Dashboard đầy đủ | ❌ Không có |
| Responsive | ✅ 3 breakpoints | ✅ Native mobile |
| Dark mode | ❌ Backlog | ❌ Backlog |
| Push notifications | ❌ Backlog | ❌ Backlog (FCM/APNs) |
| Deep linking | ✅ React Router | ❌ Không có |
| Code splitting | ✅ Lazy routes | N/A (native bundle) |

---

## 9. Điểm Cần Chú Ý / Cải Thiện

### 9.1 Navigation Không Có Back Stack
`App.tsx` dùng `switch/case` đơn giản — không có back history. Nhấn back trên Android sẽ thoát app thay vì quay lại màn trước. Cần xử lý `BackHandler` hoặc chuyển sang React Navigation.

### 9.2 MessagesScreen Quá Lớn
`MessagesScreen.tsx` xử lý quá nhiều trách nhiệm (chat UI, group management, video call, media gallery). Nên tách thành các component/hook nhỏ hơn để dễ maintain.

### 9.3 Không Có Error Boundary
Web có `ErrorBoundary` component. Mobile chưa có — crash trong bất kỳ màn hình nào sẽ crash toàn app.

### 9.4 Không Có Offline Indicator
Web có banner vàng khi mất kết nối (`navigator.onLine`). Mobile chưa có — cần dùng `@react-native-community/netinfo`.

### 9.5 Push Notifications Chưa Có
FCM (Android) và APNs (iOS) chưa tích hợp. App chỉ nhận thông báo khi đang mở và có socket connection.

### 9.6 NativeWind v5 Còn Preview
`nativewind@^5.0.0-preview.3` — phiên bản preview có thể không ổn định. Nên theo dõi stable release.

### 9.7 Không Có Deep Linking
Không có `expo-linking` config — không thể mở app từ notification push hay URL bên ngoài.

---

## 10. Hướng Phát Triển Tiếp Theo (Backlog)

| Ưu tiên | Tính năng | Effort | Lý do |
|---------|-----------|--------|-------|
| Cao | Android Back Handler | Thấp | UX cơ bản, dễ implement |
| Cao | Push Notifications (FCM/APNs) | Cao | Thông báo khi app đóng |
| Cao | Error Boundary | Thấp | Ổn định app |
| Trung bình | Offline Indicator (`netinfo`) | Thấp | UX khi mất mạng |
| Trung bình | Deep Linking (`expo-linking`) | Trung bình | Notification tap → mở đúng màn hình |
| Thấp | Dark Mode | Trung bình | NativeWind hỗ trợ sẵn `dark:` prefix |
| Thấp | Admin/Moderator screens | Cao | Ít dùng trên mobile |
| Thấp | Theme/Background/Auto-delete/Lock hội thoại | Trung bình | Backend đã hỗ trợ; ít giá trị trên mobile |

---

## 11. Báo Cáo Kỹ Thuật — Sửa Bug & Đồng Bộ Tính Năng Nhắn Tin (2026-06-01)

> Mục tiêu đợt này: vá triệt để các lỗi nhắn tin (chat 1-1 + nhóm), lỗi UX/UI, và bổ sung để phần
> nhắn tin mobile **ngang bằng web**. Phương pháp: đối chiếu trực tiếp mã mobile với
> controller/socket backend NestJS thay vì tin tài liệu — nhiều endpoint/sự kiện mobile được clone
> không khớp backend nên tính năng 404/không chạy dù trước đó đánh dấu "✅".

### 11.1 Công nghệ đã áp dụng & cách áp dụng

| Công nghệ | Áp dụng cho tính năng | Cách áp dụng |
|-----------|----------------------|--------------|
| **Socket.IO client** (`socket.io-client` 4.8) | Typing indicator, read receipts, đồng bộ nhóm realtime | Đăng ký listener trong `useEffect` của `MessagesScreen`, cleanup bằng `socket.off`. Sự kiện chuẩn hóa theo đúng backend: `message:typing` (`{conversationId, fromUserId, isTyping}`), `message:seen`, `conversation:updated/members/nickname`. |
| **REST qua XHR** (`src/lib/api.ts`) | mark-read, role nhóm, pin/mute/clear, nickname, search | Thêm method mới, path đối chiếu 1-1 với `conversation.controller.ts` / `message.controller.ts`. Tự refresh JWT khi 401. |
| **JWT decode tại client** | Xác định `viewerReacted`, người gửi | `getCurrentUserId()` decode payload base64 của access token (đã có sẵn). |
| **Optimistic UI + reconcile** | Gửi text/sticker | Chèn tin `local-*` ngay, thay bằng tin server trả về; rollback khi lỗi (đã dùng cho text, mở rộng cho sticker). |
| **Debounce** (`setTimeout`) | Tìm kiếm tin trong hội thoại | `useEffect` debounce 350ms gọi `listMessages(convId, {q})`; hủy bằng cờ `cancelled`. |
| **Token-based sticker** | Sticker liên thông web↔mobile | Dùng đúng token `emoji:🔥`/`icon:heart` của web; gửi `{type:'sticker', text, sticker}`; render glyph (map `icon:*` → emoji gần nghĩa). |
| **`useMemo`/`useCallback`** | Read-receipt, nickname map, handlers | Tính `lastSeenOwnMessageId`, `memberNicknameMap` bằng `useMemo`; handler bọc `useCallback` đúng deps. |

### 11.2 Bug đã vá

| # | Lỗi (chat 1-1 & nhóm) | Nguyên nhân | Cách sửa |
|---|----------------------|-------------|----------|
| A1 | "Đang soạn tin..." không bao giờ hiện; typing không sang web | Mobile emit/nghe `typing:start`/`typing:stop` + field `userId`; backend chỉ có `message:typing`/`typing`/`stopTyping` + `fromUserId` | Đổi emit/nghe sang `message:typing`, đọc `fromUserId` |
| A2 | Typing kẹt vĩnh viễn khi mất sự kiện stop | Không có timeout | Tự `setPeerIsTyping(false)` sau 4s, reset mỗi sự kiện |
| A3 | Phân quyền phó nhóm / chuyển trưởng nhóm → 404 | Gọi `/members/:id/role` (không tồn tại) | Dùng `/deputy` (`setGroupDeputy`), `/leader` (`transferGroupLeader`); thêm UI chuyển trưởng nhóm |
| A4 | Unread không reset trên server, không ai thấy "đã xem" | Mobile chưa từng gọi mark-read | Thêm `markConversationRead`, gọi khi mở hội thoại + khi có tin mới |
| A5 | Forward picker hiện "Cuoc tro chuyen" cho chat 1-1 | Dùng `item.name` (null với direct) | Dùng `resolveConvDisplayName(item, userId)` |
| A6 | Thay đổi nhóm của người khác (đổi tên/role/thêm-xóa thành viên/biệt danh) không cập nhật realtime | Mobile không nghe `conversation:updated/members/nickname` | Thêm 3 listener → reload chi tiết + danh sách; tự đóng hội thoại khi mình bị kick |

### 11.3 Tính năng bổ sung (parity với web)

- **Read receipts ("Đã xem"):** map `readBy` trên message + `lastReadAt`/`lastReadMessageId` trên member; nghe `message:seen`; nhãn "Đã xem"/"Đã xem (n)" dưới tin cuối mình gửi đã được người khác đọc.
- **Tìm kiếm tin trong hội thoại:** nút kính lúp ở header → ô tìm, lọc server-side qua `listMessages?q=`.
- **Ghim / Tắt tiếng (1h/8h/vô hạn) / Xóa lịch sử:** thêm mục trong menu hội thoại (`/pin`, `/mute`, `DELETE .../messages`). Backend tự đẩy hội thoại đã ghim lên đầu danh sách.
- **Sticker:** panel lưới emoji, gửi/nhận liên thông web; render không bong bóng, glyph lớn 56px.
- **Biệt danh thành viên:** long-press thành viên → "Đặt biệt danh" (mọi thành viên đặt được); hiển thị biệt danh trong bong bóng tin & danh sách thành viên.

### 11.4 Tối ưu đã đạt được

- **Khớp hợp đồng API/sự kiện với backend:** loại bỏ toàn bộ call 404 trong luồng nhắn tin (role, typing) — tính năng chạy thật thay vì "✅ trên giấy".
- **Giảm tải mạng khi tìm kiếm:** debounce 350ms + hủy request cũ (cờ `cancelled`) tránh gọi API mỗi ký tự.
- **Realtime nhất quán mobile↔web↔mobile:** dùng đúng tên sự kiện chuẩn của backend nên 3 chiều (web–web, mobile–mobile, web–mobile) cùng nhận typing/seen/biến động nhóm.
- **Optimistic + dedup:** sticker/text hiển thị tức thì; chống trùng tin bằng `markMessageEventHandled` và kiểm tra `id` khi reconcile.
- **Tự phục hồi trạng thái nhóm:** khi bị kick khỏi nhóm đang mở, tự thoát hội thoại (tránh thao tác trên nhóm đã rời → lỗi).
- **Type-safe:** mở rộng `Conversation`/`Message` (readBy, lastRead*, nickname, isPinned/isMuted), `npx tsc --noEmit` pass, không dùng `any` ngoài ranh giới payload socket.

### 11.5 Sự kiện Socket đang dùng (sau khi chuẩn hóa)

**Lắng nghe (nhận từ server):** `message:new`, `message:updated`, `message:reaction`, `message:deleted`,
`message:typing` + `typing`/`stopTyping`, `message:seen`, `conversation:updated`, `conversation:members`,
`conversation:nickname`, các sự kiện call (`call:offer/answer/end/ended/reject/unavailable`).

**Phát đi (gửi lên server):** `join-conversation`/`leave-conversation`, `message:typing`,
`call:offer/answer/join/end/reject`, `call:room:acquire`.

### 11.6 Giới hạn còn lại (không blocking)

- Theme/background/auto-delete/khóa-ẩn hội thoại: backend có nhưng chưa làm UI mobile (ít giá trị trên mobile).
- "Tắt thông báo" và "Tắt tiếng" trong menu hơi trùng vai trò (đều ảnh hưởng `notificationsEnabled`) — giữ cả hai vì là 2 endpoint backend khác nhau.
- Cần kiểm thử realtime trên thiết bị thật/dev build với 2 tài khoản (logic & type đã verify; chưa chạy app thật).

---

## 12. Báo Cáo Kỹ Thuật — Sửa Bug Bảng Tin / Khám Phá / Hồ Sơ (2026-06-01)

> Rà soát 3 khu vực Bảng tin (Feed), Khám phá (Explore/Search), Hồ sơ (Profile) bằng cách đối chiếu mã
> mobile với backend NestJS. **Đợt này các endpoint REST đều khớp (không 404)** — bug nằm ở
> **realtime/logic/UX**. Đã verify: `post`/`comment` reaction backend không whitelist type (không lỗi);
> `user.controller` trả `lastActiveAt` nhưng `mapAuthUser` mobile bỏ field.

### 12.1 Bug đã vá

| # | Khu vực | Lỗi | Nguyên nhân | Cách sửa | File |
|---|---------|-----|-------------|----------|------|
| F1 | Bảng tin | Realtime feed chết (bài/bình luận mới của người khác không tự hiện) | Mobile nghe `post:new`/`comment:new`; backend phát `post:created/updated/deleted` + `comment:created` qua `emitSocialEvent` (broadcast toàn cục) | Đăng ký đúng tên sự kiện (vẫn debounce `loadFeed`) | `FeedScreen.tsx` |
| F2 | Bảng tin | Footer "cuộn xuống để tải lại" gây hiểu nhầm (không có `onEndReached`); biến `isLoadingMore` chết | Code stub chưa hoàn thiện | Bỏ text sai → "Kéo xuống để làm mới"; xóa `isLoadingMore` | `FeedScreen.tsx` |
| F3 | Bảng tin | Đăng bài lỗi → cảnh báo "unhandled promise rejection" | `handlePost` rethrow để giữ modal mở nhưng `PostComposer.handleSubmit` không catch | Bọc `onPost` trong try/catch (nuốt lỗi đã Alert), chỉ đóng modal khi thành công | `PostComposer.tsx` |
| E1 | Khám phá | Nút Thích/Chia sẻ/Lưu/Menu ở "Thịnh hành" là nút chết; trạng thái "Đã thích" sai | `PostCard` dùng `currentUserId={0}` + handlers rỗng `() => {}` | Truyền `user` thật; wire `handleLike`/`handleReact`/`handleSave` (tái dùng pattern Feed), Bình luận/Chia sẻ → mở bài, Menu → báo cáo | `SearchScreen.tsx`, `App.tsx` |
| P1 | Hồ sơ | Số "Đã lưu" luôn 0 cho tới khi mở tab "Đã lưu" | `savedPosts` chỉ load khi `activeTab==='saved'` | Load `listSavedPosts` ngay khi mount (tab vẫn refresh khi mở) | `MyProfileScreen.tsx` |
| P2 | Hồ sơ | Thiếu chỉ báo trực tuyến trên hồ sơ người khác | `mapAuthUser` bỏ `lastActiveAt` | Thêm `lastActiveAt` vào `AuthUser` + map trong `api.ts`; chấm xanh + "Đang hoạt động" khi `< 5 phút` | `UserProfileScreen.tsx`, `types/auth.ts`, `api.ts` |

### 12.2 Công nghệ & cách áp dụng
- **Socket.IO realtime feed:** dùng đúng tên sự kiện backend (`post:created/updated/deleted`, `comment:created`) + debounce 450ms gọi `loadFeed` để gộp nhiều cập nhật.
- **Tái dùng pattern reaction/save của Feed cho Explore:** `reactPost`/`unreactPost`/`savePost`/`unsavePost`, cập nhật state tại chỗ (`replacePost` đồng bộ cả `trendingPosts` lẫn kết quả tìm kiếm).
- **Tính trạng thái online client-side:** so `lastActiveAt` với `Date.now()` ngưỡng 5 phút (giống profile web), ẩn khi không có dữ liệu (tôn trọng quyền riêng tư "hiển thị lần cuối hoạt động").

### 12.3 Tối ưu đã đạt được
- Bảng tin **tự cập nhật realtime** thật (trước đây hoàn toàn không chạy) — không phải kéo refresh thủ công.
- Khám phá **tương tác đầy đủ** (thích/emoji/lưu/báo cáo) thay vì nút chết gây nhầm lẫn.
- Loại bỏ cảnh báo unhandled rejection và UI gây hiểu nhầm; số liệu hồ sơ chính xác ngay khi mở.
- `npx tsc --noEmit` pass; không dùng `any` ngoài ranh giới payload.

### 12.4 Giới hạn còn lại (không phải bug, không sửa)
- Tìm **bài viết** ở Khám phá lọc client-side trên `listFeed` (backend chưa có endpoint search post).
- "Ẩn bài viết" chỉ lưu cục bộ (backend không có hide cho user) → mất sau khi tải lại.
- Bài viết trong hồ sơ (mình & người khác) hiển thị dạng dòng tóm tắt, không phải `PostCard` đầy đủ (chạm để mở chi tiết) — chủ ý giữ gọn.
- Cần kiểm thử realtime feed trên thiết bị thật/dev build với 2 tài khoản (logic & type đã verify).
