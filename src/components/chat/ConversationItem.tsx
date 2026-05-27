import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Avatar } from '../common/Avatar';
import type { Conversation } from '../../types';
import { formatTime } from '../../utils';

interface ConversationItemProps {
  conversation: Conversation;
  onPress: () => void;
}

export function ConversationItem({ conversation, onPress }: ConversationItemProps) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-4 py-4 bg-surface border-b border-border"
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Avatar
        name={conversation.name || 'G'}
        avatarUrl={conversation.avatarUrl}
        size="md"
      />
      <View className="flex-1 ml-3">
        <View className="flex-row justify-between">
          <Text className="text-foreground font-semibold text-sm">
            {conversation.name || 'Cuộc trò chuyện'}
          </Text>
          {conversation.lastMessageAt && (
            <Text className="text-muted-foreground text-xs">{formatTime(conversation.lastMessageAt)}</Text>
          )}
        </View>
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
          {conversation.lastMessage || 'Chưa có tin nhắn'}
        </Text>
      </View>
      {conversation.unreadCount && conversation.unreadCount > 0 ? (
        <View className="bg-primary rounded-full min-w-5 h-5 items-center justify-center px-1.5 ml-2 mt-1">
          <Text className="text-white text-[10px] font-bold">{conversation.unreadCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

