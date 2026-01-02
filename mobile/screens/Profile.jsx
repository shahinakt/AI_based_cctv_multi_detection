import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = 'profile_info_v1';

export default function ProfileScreen() {
  const tailwind = useTailwind();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PROFILE_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          setUsername(p.username || '');
          setEmail(p.email || '');
        }
      } catch (e) {
        console.warn('AsyncStorage read error', e);
      }
    })();
  }, []);

  const save = async () => {
    const profile = { username, email };
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      Alert.alert('Saved', 'Profile saved successfully.');
    } catch (e) {
      console.warn('save error', e);
      Alert.alert('Error', 'Could not save profile.');
    }
  };

  return (
    <ScrollView contentContainerStyle={tailwind('flex-1 bg-gray-50 p-4')}> 
      <Text style={tailwind('text-2xl font-bold mb-6 text-gray-800')}>Profile</Text>

      <Text style={tailwind('text-sm text-gray-700 mb-2')}>Username</Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="Your display name"
        autoCapitalize="none"
        style={tailwind('bg-white p-3 rounded-lg mb-4 border border-gray-300')}
      />

      <Text style={tailwind('text-sm text-gray-700 mb-2')}>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="you@example.com"
        autoCapitalize="none"
        style={tailwind('bg-white p-3 rounded-lg mb-6 border border-gray-300')}
      />

      <TouchableOpacity onPress={save} style={tailwind('bg-blue-600 py-3 rounded-lg items-center')}>
        <Text style={tailwind('text-white font-bold')}>Save Profile</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
