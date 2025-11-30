import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export default function NotificationBanner({ visible, message, onPress, duration = 3000 }) {
  const anim = useRef(new Animated.Value(visible ? 0 : -80)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(anim, { toValue: 0, useNativeDriver: true }).start();
      const t = setTimeout(() => {
        Animated.timing(anim, { toValue: -80, duration: 300, useNativeDriver: true }).start();
        if (onPress === 'autoHide' && typeof onPress === 'function') onPress();
      }, duration);
      return () => clearTimeout(t);
    } else {
      Animated.timing(anim, { toValue: -80, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible, anim, duration, onPress]);

  if (!message) return null;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        transform: [{ translateY: anim }],
        backgroundColor: '#0369A1',
        paddingVertical: 12,
        paddingHorizontal: 16,
        zIndex: 999,
      }}
    >
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{message}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
