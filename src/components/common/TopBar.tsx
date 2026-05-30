import React, { ReactNode } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TopBarProps {
  title: string;
  leftAction?: {
    label: string;
    onPress: () => void;
  };
  rightAction?: ReactNode;
  safeArea?: boolean;
}

export function TopBar({ title, leftAction, rightAction, safeArea = true }: TopBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-surface border-b border-border"
      style={safeArea ? { paddingTop: insets.top } : undefined}
    >
      <View className="h-14 flex-row items-center px-4">
        {leftAction ? (
          <TouchableOpacity
            onPress={leftAction.onPress}
            className="h-10 justify-center pr-3"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text className="text-primary font-semibold text-sm">{leftAction.label}</Text>
          </TouchableOpacity>
        ) : (
          <View className="w-10" />
        )}
        <Text className="flex-1 text-base font-bold text-foreground text-center">{title}</Text>
        {rightAction ? rightAction : <View className="w-10" />}
      </View>
    </View>
  );
}
