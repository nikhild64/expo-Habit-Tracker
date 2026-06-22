import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Dimensions, Text, TouchableOpacity, View } from 'react-native';

import type { Colors } from '@/lib/ui/theme';

const CLOCK_SIZE = Math.min(Dimensions.get('window').width - 80, 252);
const CC = CLOCK_SIZE / 2;
const MARKER_R = CC * 0.76;
const HAND_LEN = CC * 0.60;
const HOUR_LABELS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MIN_LABELS  = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/**
 * Interactive analog clock picker.
 * - Tap the hour digit to enter hour-selection mode.
 * - Tap the minute digit to enter minute-selection mode.
 * - Drag/tap on the clock face to pick a value; hour auto-advances to minute mode.
 * - Minute resolution is 1 minute (any 0–59 value is valid).
 */
export function ClockFace({
  hour24,
  minute,
  onChangeHour,
  onChangeMinute,
  C,
}: {
  hour24: number;
  minute: number;
  onChangeHour: (h: number) => void;
  onChangeMinute: (m: number) => void;
  C: Colors;
}) {
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const isPM   = hour24 >= 12;
  const hour12 = hour24 % 12 || 12;

  function stepHour(delta: 1 | -1) {
    const newH12 = ((hour12 - 1 + delta + 12) % 12) + 1;
    const newH24 = isPM
      ? (newH12 === 12 ? 12 : newH12 + 12)
      : (newH12 === 12 ? 0 : newH12);
    onChangeHour(newH24);
    setMode('hour');
  }

  function stepMinute(delta: 1 | -1) {
    onChangeMinute((minute + delta + 60) % 60);
    setMode('minute');
  }

  const handAngleDeg = mode === 'hour'
    ? (hour12 === 12 ? -90 : hour12 * 30 - 90)
    : (minute / 60) * 360 - 90;
  const handAngleRad = (handAngleDeg * Math.PI) / 180;
  const handMidX = CC + (HAND_LEN / 2) * Math.cos(handAngleRad);
  const handMidY = CC + (HAND_LEN / 2) * Math.sin(handAngleRad);
  const handEndX = CC + HAND_LEN * Math.cos(handAngleRad);
  const handEndY = CC + HAND_LEN * Math.sin(handAngleRad);

  function handleTouch(evt: { nativeEvent: { locationX: number; locationY: number } }) {
    const { locationX, locationY } = evt.nativeEvent;
    const dx = locationX - CC;
    const dy = locationY - CC;
    if (Math.sqrt(dx * dx + dy * dy) < CC * 0.14) return;
    const angle = Math.atan2(dy, dx);
    const normalized = (angle + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);

    if (mode === 'hour') {
      const rawHour = Math.round((normalized / (2 * Math.PI)) * 12) % 12;
      const newH12 = rawHour === 0 ? 12 : rawHour;
      const newH24 = isPM
        ? (newH12 === 12 ? 12 : newH12 + 12)
        : (newH12 === 12 ? 0 : newH12);
      onChangeHour(newH24);
      setTimeout(() => setMode('minute'), 120);
    } else {
      const rawMin = Math.round((normalized / (2 * Math.PI)) * 60) % 60;
      onChangeMinute(rawMin);
    }
  }

  const labels = mode === 'hour' ? HOUR_LABELS : MIN_LABELS;

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      {/* Time display with stepper arrows */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>

        {/* Hour stepper */}
        <View style={{ alignItems: 'center', gap: 2 }}>
          <TouchableOpacity style={{ padding: 6 }} onPress={() => stepHour(1)} hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}>
            <Ionicons name="chevron-up" size={22} color={mode === 'hour' ? C.tint : C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode('hour')}
            style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: mode === 'hour' ? C.tintLight : 'transparent' }}
          >
            <Text style={{ fontSize: 46, fontWeight: '800', color: mode === 'hour' ? C.tint : C.textSecondary, letterSpacing: -2, width: 60, textAlign: 'center' }}>
              {hour12}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 6 }} onPress={() => stepHour(-1)} hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}>
            <Ionicons name="chevron-down" size={22} color={mode === 'hour' ? C.tint : C.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Colon separator — vertically centred between the number rows */}
        <Text style={{ fontSize: 46, fontWeight: '200', color: C.textMuted, marginTop: 4, alignSelf: 'center' }}>:</Text>

        {/* Minute stepper */}
        <View style={{ alignItems: 'center', gap: 2 }}>
          <TouchableOpacity style={{ padding: 6 }} onPress={() => stepMinute(1)} hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}>
            <Ionicons name="chevron-up" size={22} color={mode === 'minute' ? C.tint : C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode('minute')}
            style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: mode === 'minute' ? C.tintLight : 'transparent' }}
          >
            <Text style={{ fontSize: 46, fontWeight: '800', color: mode === 'minute' ? C.tint : C.textSecondary, letterSpacing: -2, width: 60, textAlign: 'center' }}>
              {minute.toString().padStart(2, '0')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 6 }} onPress={() => stepMinute(-1)} hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}>
            <Ionicons name="chevron-down" size={22} color={mode === 'minute' ? C.tint : C.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* AM/PM text label */}
        <Text style={{ fontSize: 16, fontWeight: '700', color: C.textMuted, marginLeft: 6, alignSelf: 'center', marginTop: 6 }}>
          {isPM ? 'PM' : 'AM'}
        </Text>
      </View>

      {/* Mode hint */}
      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.textMuted, textTransform: 'uppercase' }}>
        {mode === 'hour' ? 'Select hour' : 'Select minute'}
      </Text>

      {/* Clock face */}
      <View style={{ width: CLOCK_SIZE, height: CLOCK_SIZE, borderRadius: CC, backgroundColor: C.surfaceAlt, borderWidth: 2, borderColor: C.border, position: 'relative' }}>
        {/* Tick marks */}
        {Array.from({ length: 60 }, (_, i) => {
          const isMajor = i % 5 === 0;
          const a = (i * 6 - 90) * Math.PI / 180;
          const r1 = CC * (isMajor ? 0.90 : 0.93);
          return (
            <View key={i} style={{
              position: 'absolute',
              left: CC + r1 * Math.cos(a) - (isMajor ? 1.5 : 0.75),
              top: CC + r1 * Math.sin(a) - (isMajor ? 2.5 : 1.5),
              width: isMajor ? 3 : 1.5,
              height: isMajor ? 5 : 3,
              backgroundColor: isMajor ? C.borderStrong : C.border,
              borderRadius: 1,
              transform: [{ rotate: `${i * 6}deg` }],
            }} />
          );
        })}

        {/* Hour / minute markers */}
        {labels.map((val, i) => {
          const a = (i * 30 - 90) * Math.PI / 180;
          const x = CC + MARKER_R * Math.cos(a);
          const y = CC + MARKER_R * Math.sin(a);
          const isExact = mode === 'hour' ? val === hour12 : val === minute;
          return (
            <View
              key={val}
              style={{ position: 'absolute', left: x - 18, top: y - 18, width: 36, height: 36, borderRadius: 18, backgroundColor: isExact ? C.tint : 'transparent', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: mode === 'minute' ? 13 : 15, fontWeight: isExact ? '700' : '500', color: isExact ? '#fff' : C.text }}>
                {mode === 'minute' ? val.toString().padStart(2, '0') : val}
              </Text>
            </View>
          );
        })}

        {/* Clock hand */}
        <View style={{ position: 'absolute', left: handMidX - 1.5, top: handMidY - HAND_LEN / 2, width: 3, height: HAND_LEN, backgroundColor: C.tint, borderRadius: 1.5, opacity: 0.85, transform: [{ rotate: `${handAngleDeg + 90}deg` }] }} />
        {/* End dot */}
        <View style={{ position: 'absolute', left: handEndX - 6, top: handEndY - 6, width: 12, height: 12, borderRadius: 6, backgroundColor: C.tint }} />
        {/* Center dot */}
        <View style={{ position: 'absolute', left: CC - 5, top: CC - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: C.tint }} />

        {/*
          Transparent touch interceptor — must be the LAST child so it sits on top
          of all decorative children. When a user taps on a tick mark or label,
          React Native would otherwise report locationX/Y relative to that child
          (not the clock face), causing wrong angle calculations. This overlay
          ensures locationX/Y are always relative to (0,0) of the clock face.
        */}
        <View
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: CC }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleTouch as never}
          onResponderMove={handleTouch as never}
        />
      </View>

      {/* AM / PM toggle */}
      <View style={{ flexDirection: 'row', borderRadius: 10, borderWidth: 1.5, borderColor: C.border, overflow: 'hidden' }}>
        {(['AM', 'PM'] as const).map(period => {
          const active = isPM === (period === 'PM');
          return (
            <TouchableOpacity
              key={period}
              style={{ paddingHorizontal: 32, paddingVertical: 11, backgroundColor: active ? C.tint : C.surface }}
              onPress={() => {
                if (period === 'AM' && isPM) onChangeHour(hour24 - 12);
                else if (period === 'PM' && !isPM) onChangeHour(hour24 + 12);
              }}
            >
              <Text style={{ fontWeight: '700', fontSize: 15, color: active ? '#fff' : C.textSecondary }}>{period}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
