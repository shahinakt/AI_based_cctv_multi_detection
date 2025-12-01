import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getMe, updateUser } from '../services/api';

export default function AdminProfileScreen({ navigation }) {
  const tailwind = useTailwind();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await getMe();
      if (!res.success) {
        Alert.alert('Error', res.message || 'Failed to fetch profile');
        return;
      }
      setUser(res.data);
      setUsername(res.data.username || '');
      setEmail(res.data.email || '');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await updateUser(user.id, { username, email });
      if (!res.success) {
        Alert.alert('Error', res.message || 'Failed to update');
      } else {
        Alert.alert('Saved', 'Profile updated');
        setUser(res.data);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={tailwind('flex-1 justify-center items-center')}><ActivityIndicator /></View>;

  return (
    <ScrollView contentContainerStyle={tailwind('p-4 bg-sky-50 flex-1')}>
      <Text style={tailwind('text-2xl font-bold mb-4')}>Admin Profile</Text>
      <Text style={tailwind('text-sm mb-2')}>Username</Text>
      <TextInput value={username} onChangeText={setUsername} style={tailwind('bg-white p-3 rounded mb-4 border')} />
      <Text style={tailwind('text-sm mb-2')}>Email</Text>
      <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" style={tailwind('bg-white p-3 rounded mb-4 border')} />

      <TouchableOpacity onPress={save} style={tailwind('bg-sky-600 py-3 rounded items-center')} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={tailwind('text-white font-bold')}>Save</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
