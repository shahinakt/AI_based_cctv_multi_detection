import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, StatusBar } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getMe, updateUser } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import BottomNavigation from '../components/BottomNavigation';

export default function AdminProfileScreen({ navigation }) {
  const tailwind = useTailwind();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
        Alert.alert('Success', 'Profile updated successfully');
        setUser(res.data);
        setIsEditing(false);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleCancel = () => {
    setUsername(user.username || '');
    setEmail(user.email || '');
    setIsEditing(false);
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.multiRemove(['adminToken', 'viewerToken', 'securityToken', 'userToken', 'user']);
              navigation.replace('Registration');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Failed to logout');
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={[tailwind('flex-1 justify-center items-center'), { backgroundColor: '#F9FAFB' }]}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={tailwind('text-gray-400 text-sm mt-3')}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={[tailwind('flex-1'), { backgroundColor: '#FFFFFF' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Minimal Header */}
      <View style={[tailwind('px-6'), { paddingTop: 50, paddingBottom: 30 }]}>
        <Text style={[tailwind('text-2xl font-bold'), { color: '#111827' }]}>
          Profile
        </Text>
      </View>

      <ScrollView 
        style={tailwind('flex-1')} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <View style={tailwind('px-6')}>
          {/* Profile Picture and Info */}
          <View style={tailwind('items-center mb-8')}>
            <View style={[tailwind('w-24 h-24 rounded-full items-center justify-center mb-3'), { backgroundColor: '#EEF2FF' }]}>
              <Text style={[tailwind('text-4xl font-bold'), { color: '#6366F1' }]}>
                {username ? username.charAt(0).toUpperCase() : 'A'}
              </Text>
            </View>
            <Text style={[tailwind('text-xl font-bold mb-1'), { color: '#111827' }]}>
              {username || 'Admin'}
            </Text>
            <Text style={tailwind('text-sm text-gray-500')}>
              Administrator
            </Text>
          </View>

          {/* Username Field - Minimal */}
          <View style={tailwind('mb-5')}>
            <Text style={tailwind('text-xs text-gray-400 mb-2')}>Username</Text>
            <TextInput 
              value={username} 
              onChangeText={setUsername} 
              editable={isEditing}
              style={[
                tailwind('text-base py-3 border-b'), 
                { 
                  color: isEditing ? '#111827' : '#6B7280', 
                  borderBottomColor: isEditing ? '#6366F1' : '#E5E7EB' 
                }
              ]}
              placeholder="Enter username"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Email Field - Minimal */}
          <View style={tailwind('mb-8')}>
            <Text style={tailwind('text-xs text-gray-400 mb-2')}>Email</Text>
            <TextInput 
              value={email} 
              onChangeText={setEmail} 
              editable={isEditing}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[
                tailwind('text-base py-3 border-b'), 
                { 
                  color: isEditing ? '#111827' : '#6B7280', 
                  borderBottomColor: isEditing ? '#6366F1' : '#E5E7EB' 
                }
              ]}
              placeholder="Enter email"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Action Buttons */}
          {!isEditing ? (
            <TouchableOpacity 
              onPress={handleEdit} 
              style={[
                tailwind('py-4 items-center justify-center rounded-lg mb-8'),
                { backgroundColor: '#6366F1' }
              ]} 
              activeOpacity={0.7}
            >
              <Text style={tailwind('text-white font-semibold text-base')}>Edit Profile</Text>
            </TouchableOpacity>
          ) : (
            <View style={tailwind('flex-row mb-8')}>
              <TouchableOpacity 
                onPress={handleCancel} 
                style={[
                  tailwind('flex-1 py-4 items-center justify-center rounded-lg mr-2'),
                  { backgroundColor: '#F3F4F6' }
                ]} 
                activeOpacity={0.7}
              >
                <Text style={[tailwind('font-semibold text-base'), { color: '#6B7280' }]}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={save} 
                style={[
                  tailwind('flex-1 py-4 items-center justify-center rounded-lg ml-2'),
                  { backgroundColor: '#6366F1' }
                ]} 
                disabled={saving}
                activeOpacity={0.7}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={tailwind('text-white font-semibold text-base')}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Logout - Minimal */}
          <TouchableOpacity 
            onPress={handleLogout}
            style={tailwind('py-4 items-center')}
            activeOpacity={0.7}
          >
            <Text style={[tailwind('text-base font-medium'), { color: '#EF4444' }]}>Logout</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      <BottomNavigation navigation={navigation} activeRoute="AdminProfile" role="admin" />
    </View>
  );
}
