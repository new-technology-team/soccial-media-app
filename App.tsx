import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  StatusBar,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import "./src/global.css";
import { AuthScreen } from "./src/screens/AuthScreen";
import { FeedScreen } from "./src/screens/FeedScreen";
import { MessagesScreen } from "./src/screens/MessagesScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { UserProfileScreen } from "./src/screens/UserProfileScreen";
import { SearchScreen } from "./src/screens/SearchScreen";
import { AIChatScreen } from "./src/screens/AIChatScreen";
import { FriendsScreen } from "./src/screens/FriendsScreen";
import { MyProfileScreen } from "./src/screens/MyProfileScreen";
import { AppNavigator } from "./src/navigation/AppNavigator";
import { Loading } from "./src/components/common/Loading";
import { api, authStore, getSocket, disconnectSocket } from "./src/lib";
import type { AuthUser } from "./src/types";

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState("feed");
  const [feedFocusPostId, setFeedFocusPostId] = useState<string | null>(null);
  const [feedOpenCommentsPostId, setFeedOpenCommentsPostId] = useState<
    string | null
  >(null);
  const [messageTarget, setMessageTarget] = useState<{
    userId: number;
    routeKey: number;
  } | null>(null);
  const [profileRoute, setProfileRoute] = useState<{
    userId: number;
    returnTab: string;
  } | null>(null);
  const [aiReturnTab, setAiReturnTab] = useState("feed");
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    authStore.hydrate().then(() => {
      const tokens = authStore.getTokens();
      if (tokens?.accessToken) {
        api
          .me()
          .then((me) => setUser(me))
          .catch(() => {
            void authStore.clear();
            disconnectSocket();
            setUser(null);
          });
      }
      setIsRestoring(false);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    const token = authStore.getTokens()?.accessToken;
    if (!token) return;
    getSocket(token);
  }, [user]);

  const handleLogin = useCallback((loggedInUser: AuthUser) => {
    disconnectSocket();
    setUser(loggedInUser);
    setActiveTab("feed");
    const token = authStore.getTokens()?.accessToken;
    if (token) {
      getSocket(token, () => console.log("Socket connected"));
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    authStore.clear();
    disconnectSocket();
    setUser(null);
    setActiveTab("feed");
  }, []);

  const openPostInFeed = useCallback(
    (postId: string, options?: { openComments?: boolean }) => {
      setFeedFocusPostId(postId);
      setFeedOpenCommentsPostId(options?.openComments ? postId : null);
      setActiveTab("feed");
    },
    [],
  );

  const handleFeedRouteConsumed = useCallback(() => {
    setFeedFocusPostId(null);
    setFeedOpenCommentsPostId(null);
  }, []);

  const openDirectMessage = useCallback((userId: number) => {
    setMessageTarget({ userId, routeKey: Date.now() });
    setProfileRoute(null);
    setActiveTab("messages");
  }, []);

  const handleMessageRouteConsumed = useCallback(() => {
    setMessageTarget(null);
  }, []);

  const openUserProfile = useCallback(
    (userId: number) => {
      if (!user) return;
      if (userId === user.id) {
        setProfileRoute(null);
        setActiveTab("profile");
        return;
      }
      setProfileRoute({ userId, returnTab: activeTab });
      setActiveTab("user-profile");
    },
    [activeTab, user],
  );

  const handleBackFromUserProfile = useCallback(() => {
    setActiveTab(profileRoute?.returnTab || "friends");
    setProfileRoute(null);
  }, [profileRoute]);

  const handleTabChange = useCallback((tab: string) => {
    setProfileRoute(null);
    setMessageTarget(null);
    setActiveTab(tab);
  }, []);

  const openAIChat = useCallback(
    (returnTab: string) => {
      setAiReturnTab(returnTab);
      setActiveTab("ai-chat");
    },
    [],
  );

  if (isRestoring) {
    return <Loading message="Đang khôi phục phiên..." />;
  }

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  const renderScreen = () => {
    switch (activeTab) {
      case "feed":
        return (
          <FeedScreen
            user={user}
            onLogout={handleLogout}
            onOpenAIChat={() => openAIChat("feed")}
            focusPostId={feedFocusPostId}
            openCommentsPostId={feedOpenCommentsPostId}
            onRouteConsumed={handleFeedRouteConsumed}
          />
        );
      case "search":
        return (
          <SearchScreen
            onOpenPost={openPostInFeed}
            onOpenUserProfile={openUserProfile}
            onOpenAIChat={() => openAIChat("search")}
          />
        );
      case "messages":
        return (
          <MessagesScreen
            user={user}
            initialDirectUserId={messageTarget?.userId}
            initialDirectRouteKey={messageTarget?.routeKey}
            onInitialDirectHandled={handleMessageRouteConsumed}
            onOpenUserProfile={openUserProfile}
          />
        );
      case "friends":
        return (
          <FriendsScreen
            user={user}
            onMessageFriend={openDirectMessage}
            onOpenUserProfile={openUserProfile}
          />
        );
      case "ai-chat":
        return (
          <AIChatScreen
            onExit={() => {
              setActiveTab(aiReturnTab || "feed");
            }}
          />
        );
      case "user-profile":
        return profileRoute ? (
          <UserProfileScreen
            currentUser={user}
            userId={profileRoute.userId}
            onBack={handleBackFromUserProfile}
            onMessageUser={openDirectMessage}
            onOpenPost={openPostInFeed}
          />
        ) : (
          <FriendsScreen
            user={user}
            onMessageFriend={openDirectMessage}
            onOpenUserProfile={openUserProfile}
          />
        );
      case "notifications":
        return <NotificationsScreen onOpenPost={openPostInFeed} />;
      case "profile":
        return (
          <MyProfileScreen
            user={user}
            onOpenSettings={() => setActiveTab("profile-settings")}
            onOpenPost={openPostInFeed}
          />
        );
      case "profile-settings":
        return (
          <ProfileScreen
            user={user}
            onLogout={handleLogout}
            onUserUpdated={(nextUser) => setUser(nextUser)}
            onBack={() => setActiveTab("profile")}
          />
        );
      default:
        return (
          <FeedScreen
            user={user}
            onLogout={handleLogout}
            onOpenAIChat={() => openAIChat("feed")}
            focusPostId={feedFocusPostId}
            openCommentsPostId={feedOpenCommentsPostId}
            onRouteConsumed={handleFeedRouteConsumed}
          />
        );
    }
  };

  const hideNavigator = activeTab === "ai-chat";

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View className="flex-1 bg-background">
        <StatusBar />
        {renderScreen()}
        {!hideNavigator ? (
          <AppNavigator
            activeTab={activeTab === "profile-settings" ? "profile" : activeTab}
            onTabChange={handleTabChange}
          />
        ) : null}
      </View>
    </TouchableWithoutFeedback>
  );
}
