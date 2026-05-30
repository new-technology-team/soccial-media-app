import React, { useState } from "react";
import {
  View,
  TextInput,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";

interface InputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?:
    | "default"
    | "email-address"
    | "number-pad"
    | "phone-pad"
    | "url";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  icon?: string;
  error?: string;
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  style?: ViewStyle;
}

export function Input({
  label,
  placeholder,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  icon,
  error,
  multiline = false,
  numberOfLines = 1,
  maxLength,
  style,
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [showText, setShowText] = useState(false);

  return (
    <View className="mb-3" style={style}>
      {label && (
        <Text className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
          {label}
        </Text>
      )}
      <View className="relative">
        {icon && (
          <Text className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm z-10">
            {icon}
          </Text>
        )}
        <TextInput
          className={`h-12.5 rounded-xl border text-[15px] text-foreground bg-surface ${
            icon ? "pl-10 pr-4" : "px-4"
          } ${multiline ? "h-auto min-h-25 py-3 text-start" : ""} ${
            error
              ? "border-[#fecaca] bg-red-50"
              : isFocused
                ? "border-primary"
                : "border-border"
          }`}
          placeholder={placeholder}
          placeholderTextColor="#7e8592"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !showText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={numberOfLines}
          maxLength={maxLength}
          textAlignVertical={multiline ? "top" : "center"}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
        {secureTextEntry && (
          <TouchableOpacity
            className="absolute right-3 top-1/2 -translate-y-1/2"
            onPress={() => setShowText((v) => !v)}
            activeOpacity={0.7}
          >
            <Text className="text-muted-foreground text-base">{showText ? "🙈" : "👁"}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error && (
        <Text className="text-danger text-xs mt-1 font-medium">{error}</Text>
      )}
    </View>
  );
}
