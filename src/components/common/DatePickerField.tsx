import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const ITEM_HEIGHT = 48;
const VISIBLE_ITEMS = 5; // items shown at once (middle one = selected)
const PADDING_ITEMS = Math.floor(VISIBLE_ITEMS / 2); // 2 items padding top/bottom

const MONTHS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4",
  "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8",
  "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1920 + 1 }, (_, i) => String(1920 + i)).reverse();
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));

interface WheelColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  resetKey: number;
}

function WheelColumn({ items, selectedIndex, onSelect, resetKey }: WheelColumnProps) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      ref.current?.scrollTo({
        y: selectedIndex * ITEM_HEIGHT,
        animated: false,
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [resetKey, selectedIndex]);

  const handleScrollEnd = useCallback(
    (e: any) => {
      const raw = e.nativeEvent.contentOffset.y / ITEM_HEIGHT;
      const idx = Math.round(raw);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      onSelect(clamped);
    },
    [items.length, onSelect],
  );

  return (
    <View style={{ flex: 1, height: ITEM_HEIGHT * VISIBLE_ITEMS, overflow: "hidden" }}>
      {/* Highlight band */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: ITEM_HEIGHT * PADDING_ITEMS,
          height: ITEM_HEIGHT,
          left: 6,
          right: 6,
          borderTopWidth: 1.5,
          borderBottomWidth: 1.5,
          borderColor: "#0052ce",
          borderRadius: 4,
          zIndex: 1,
        }}
      />
      <ScrollView
        ref={ref}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * PADDING_ITEMS }}
      >
        {items.map((item, i) => (
          <View
            key={i}
            style={{ height: ITEM_HEIGHT, justifyContent: "center", alignItems: "center" }}
          >
            <Text
              style={{
                fontSize: 15,
                color: "#1f2733",
                fontWeight: i === selectedIndex ? "700" : "400",
              }}
            >
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

interface DatePickerFieldProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
}

function parseValue(value: string) {
  if (value && value.length === 10) {
    const [dd, mm, yyyy] = value.split("/");
    const dayIdx = DAYS.indexOf(dd ?? "01");
    const monthIdx = parseInt(mm ?? "1", 10) - 1;
    const yearIdx = YEARS.indexOf(yyyy ?? String(CURRENT_YEAR - 20));
    return {
      dayIdx: dayIdx >= 0 ? dayIdx : 0,
      monthIdx: monthIdx >= 0 && monthIdx < 12 ? monthIdx : 0,
      yearIdx: yearIdx >= 0 ? yearIdx : YEARS.indexOf(String(CURRENT_YEAR - 20)),
    };
  }
  const defaultYear = CURRENT_YEAR - 20;
  return {
    dayIdx: 0,
    monthIdx: 0,
    yearIdx: YEARS.indexOf(String(defaultYear)) >= 0
      ? YEARS.indexOf(String(defaultYear))
      : 0,
  };
}

export function DatePickerField({
  value,
  onChange,
  label,
  placeholder = "Chọn ngày sinh",
  error,
}: DatePickerFieldProps) {
  const [visible, setVisible] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const initial = parseValue(value);
  const [tempDayIdx, setTempDayIdx] = useState(initial.dayIdx);
  const [tempMonthIdx, setTempMonthIdx] = useState(initial.monthIdx);
  const [tempYearIdx, setTempYearIdx] = useState(initial.yearIdx);

  const open = useCallback(() => {
    const cur = parseValue(value);
    setTempDayIdx(cur.dayIdx);
    setTempMonthIdx(cur.monthIdx);
    setTempYearIdx(cur.yearIdx);
    setResetKey((k) => k + 1);
    setVisible(true);
  }, [value]);

  const confirm = useCallback(() => {
    const dd = DAYS[tempDayIdx] ?? "01";
    const mm = String(tempMonthIdx + 1).padStart(2, "0");
    const yyyy = YEARS[tempYearIdx] ?? String(CURRENT_YEAR - 20);
    onChange(`${dd}/${mm}/${yyyy}`);
    setVisible(false);
  }, [tempDayIdx, tempMonthIdx, tempYearIdx, onChange]);

  const displayValue = value
    ? value
    : "";

  return (
    <View style={{ marginBottom: 12 }}>
      {label ? (
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: "#58606e",
            textTransform: "uppercase",
            letterSpacing: 0.8,
            marginBottom: 4,
          }}
        >
          {label}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={open}
        activeOpacity={0.75}
        style={{
          height: 50,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: error ? "#fecaca" : "#dbe0e6",
          backgroundColor: error ? "#fef2f2" : "#ffffff",
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 14 }}>🎂</Text>
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            color: displayValue ? "#1f2733" : "#7e8592",
          }}
        >
          {displayValue || placeholder}
        </Text>
        <Text style={{ fontSize: 12, color: "#7e8592" }}>▼</Text>
      </TouchableOpacity>

      {error ? (
        <Text style={{ color: "#dc2626", fontSize: 12, marginTop: 4, fontWeight: "500" }}>
          {error}
        </Text>
      ) : null}

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        />
        <View
          style={{
            backgroundColor: "#ffffff",
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 16,
            paddingBottom: 32,
            paddingHorizontal: 16,
            marginTop: "auto",
          }}
        >
          {/* Handle bar */}
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: "#dbe0e6",
              alignSelf: "center",
              marginBottom: 16,
            }}
          />

          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: "#1f2733",
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            Chọn ngày sinh
          </Text>

          {/* Column headers */}
          <View style={{ flexDirection: "row", marginBottom: 4 }}>
            {["Ngày", "Tháng", "Năm"].map((h) => (
              <Text
                key={h}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: "600",
                  color: "#58606e",
                  textTransform: "uppercase",
                  letterSpacing: 0.6,
                }}
              >
                {h}
              </Text>
            ))}
          </View>

          {/* Wheel columns */}
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "#f3f5f8",
              borderRadius: 14,
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            <WheelColumn
              items={DAYS}
              selectedIndex={tempDayIdx}
              onSelect={setTempDayIdx}
              resetKey={resetKey}
            />
            <View style={{ width: 1, backgroundColor: "#e5e7eb" }} />
            <WheelColumn
              items={MONTHS}
              selectedIndex={tempMonthIdx}
              onSelect={setTempMonthIdx}
              resetKey={resetKey}
            />
            <View style={{ width: 1, backgroundColor: "#e5e7eb" }} />
            <WheelColumn
              items={YEARS}
              selectedIndex={tempYearIdx}
              onSelect={setTempYearIdx}
              resetKey={resetKey}
            />
          </View>

          {/* Buttons */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => setVisible(false)}
              activeOpacity={0.75}
              style={{
                flex: 1,
                height: 48,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: "#dbe0e6",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "600", color: "#58606e" }}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirm}
              activeOpacity={0.8}
              style={{
                flex: 2,
                height: 48,
                borderRadius: 12,
                backgroundColor: "#0052ce",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#ffffff" }}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
