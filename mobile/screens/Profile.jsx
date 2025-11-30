import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Linking, ScrollView } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = 'profile_info_v1';

export default function ProfileScreen() {
  const tailwind = useTailwind();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emergency1, setEmergency1] = useState('');
  const [emergency2, setEmergency2] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PROFILE_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          setUsername(p.username || '');
          setEmail(p.email || '');
          setPhone(p.phone || '');
          setEmergency1(p.emergency1 || '');
          setEmergency2(p.emergency2 || '');
        }
      } catch (e) {
        console.warn('AsyncStorage read error', e);
      }
    })();
  }, []);

  const save = async () => {
    const profile = { username, email, phone, emergency1, emergency2 };
    try {
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      Alert.alert('Saved', 'Profile saved locally.');
    } catch (e) {
      console.warn('save error', e);
      Alert.alert('Error', 'Could not save profile.');
    }
  };

  const callNumber = async (number) => {
    if (!number) {
      Alert.alert('No number', 'Emergency number not set.');
      return;
    }
    try {
      const url = `tel:${number}`;
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Call not supported', 'This device cannot make phone calls.');
      }
    } catch (e) {
      console.warn('call error', e);
      Alert.alert('Error', 'Could not place the call.');
    }
  };

  return (
    <ScrollView contentContainerStyle={tailwind('flex-1 bg-sky-50 p-4')}> 
      <Text style={tailwind('text-2xl font-bold mb-4 text-sky-700')}>Profile</Text>

      <Text style={tailwind('text-sm text-sky-700 mb-2')}>Username</Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="Your display name"
        autoCapitalize="none"
        style={tailwind('bg-white p-3 rounded-lg mb-4 border border-sky-200')}
      />

      <Text style={tailwind('text-sm text-sky-700 mb-2')}>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        placeholder="you@example.com"
        autoCapitalize="none"
        style={tailwind('bg-white p-3 rounded-lg mb-4 border border-sky-200')}
      />

      <Text style={tailwind('text-sm text-sky-700 mb-2')}>Phone Number</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+1 555 123 4567"
        style={tailwind('bg-white p-3 rounded-lg mb-4 border border-sky-200')}
      />

      <Text style={tailwind('text-sm text-sky-700 mb-2')}>Emergency Contact 1</Text>
      <TextInput
        value={emergency1}
        onChangeText={setEmergency1}
        keyboardType="phone-pad"
        placeholder="+1 555 111 2222"
        style={tailwind('bg-white p-3 rounded-lg mb-4 border border-sky-200')}
      />

      <Text style={tailwind('text-sm text-sky-700 mb-2')}>Emergency Contact 2 (optional)</Text>
      <TextInput
        value={emergency2}
        onChangeText={setEmergency2}
        keyboardType="phone-pad"
        placeholder="+1 555 333 4444"
        style={tailwind('bg-white p-3 rounded-lg mb-4 border border-sky-200')}
      />

      <TouchableOpacity onPress={save} style={tailwind('bg-sky-600 py-3 rounded-lg items-center mb-4')}>
        <Text style={tailwind('text-white font-bold')}>Save Profile</Text>
      </TouchableOpacity>

      <View style={tailwind('flex-row justify-between')}> 
        <TouchableOpacity onPress={() => callNumber(emergency1)} style={tailwind('bg-red-600 py-3 px-4 rounded-lg items-center flex-1 mr-2')}>
          <Text style={tailwind('text-white font-bold')}>Call Emergency 1</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => callNumber(emergency2)} style={tailwind('bg-red-500 py-3 px-4 rounded-lg items-center flex-1 ml-2')}>
          <Text style={tailwind('text-white font-bold')}>Call Emergency 2</Text>
        </TouchableOpacity>
      </View>

      <View style={tailwind('mt-6')}> 
        <Text style={tailwind('text-sm text-sky-600')}>Note: Emergency contacts will be used when you trigger SOS or report an unseen incident.</Text>
      </View>
    </ScrollView>
  );
}
