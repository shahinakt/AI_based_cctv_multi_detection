import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getMe, updateUser } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import BottomNavigation from '../components/BottomNavigation';

export default function ProfileScreen({ navigation }) {
  const tailwind = useTailwind();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const response = await getMe();
      if (response.success && response.data) {
        const user = response.data;
        setUserId(user.id);
        setUsername(user.username || '');
        setEmail(user.email || '');
        setPhone(user.phone || '');
        setRole(user.role || '');
      } else {
        Alert.alert('Error', response.message || 'Failed to load profile');
      }
    } catch (e) {
      console.error('Load profile error:', e);
      Alert.alert('Error', 'Could not load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    setShowEditModal(true);
  };

  const handleCancel = () => {
    setShowEditModal(false);
    loadProfile(); // Reset to original values
  };

  const save = async () => {
    if (!username.trim()) {
      return Alert.alert('Validation Error', 'Username is required');
    }

    setSaving(true);
    try {
      const response = await updateUser(userId, { 
        username: username.trim(),
        phone: phone.trim() 
      });
      
      if (response.success) {
        Alert.alert('Success', 'Profile updated successfully', [
          { text: 'OK', onPress: () => setShowEditModal(false) }
        ]);
        loadProfile(); // Reload to get fresh data
      } else {
        Alert.alert('Error', response.message || 'Failed to update profile');
      }
    } catch (e) {
      console.error('Save error:', e);
      Alert.alert('Error', 'Could not save profile');
    } finally {
      setSaving(false);
    }
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
    <View style={[tailwind('flex-1'), { backgroundColor: '#F9FAFB' }]}>
      {/* Header */}
      <View style={[tailwind('bg-indigo-600 p-6'), { paddingTop: 50, alignItems: 'center' }]}>
        <Text style={tailwind('text-white text-2xl font-bold')}>Profile</Text>
        <Text style={tailwind('text-indigo-100 text-sm')}>{role.toUpperCase()}</Text>
      </View>

      <ScrollView style={tailwind('flex-1')} contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>
        {/* Profile Info Card */}
        <View style={[tailwind('bg-white rounded-2xl p-6 mb-4'), { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }]}>
          
          {/* Username */}
          <View style={tailwind('mb-5')}>
            <Text style={tailwind('text-xs text-gray-400 mb-2')}>USERNAME</Text>
            <View style={tailwind('flex-row items-center')}>
              <Ionicons name="person" size={20} color="#6B7280" style={tailwind('mr-3')} />
              <Text style={tailwind('text-base text-gray-800 flex-1')}>{username}</Text>
            </View>
          </View>

          {/* Email */}
          <View style={tailwind('mb-5')}>
            <Text style={tailwind('text-xs text-gray-400 mb-2')}>EMAIL</Text>
            <View style={tailwind('flex-row items-center')}>
              <Ionicons name="mail" size={20} color="#6B7280" style={tailwind('mr-3')} />
              <Text style={tailwind('text-base text-gray-800 flex-1')}>{email}</Text>
            </View>
            <Text style={tailwind('text-xs text-gray-400 mt-1')}>Email cannot be changed</Text>
          </View>

          {/* Phone */}
          <View style={tailwind('mb-5')}>
            <Text style={tailwind('text-xs text-gray-400 mb-2')}>PHONE NUMBER</Text>
            <View style={tailwind('flex-row items-center')}>
              <Ionicons name="call" size={20} color="#6B7280" style={tailwind('mr-3')} />
              <Text style={tailwind('text-base text-gray-800 flex-1')}>{phone || 'Not set'}</Text>
            </View>
          </View>

          {/* Edit Button */}
          <TouchableOpacity 
            onPress={handleEdit}
            style={[tailwind('rounded-lg py-3 items-center mt-2'), { backgroundColor: '#6366F1' }]}
            activeOpacity={0.7}
          >
            <View style={tailwind('flex-row items-center')}>
              <Ionicons name="create" size={20} color="#FFFFFF" style={tailwind('mr-2')} />
              <Text style={tailwind('text-white font-bold')}>Edit Profile</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCancel}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={[tailwind('bg-white'), { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingBottom: 40, paddingHorizontal: 20 }]}>
            {/* Modal Header */}
            <View style={tailwind('flex-row items-center justify-between mb-6')}>
              <Text style={tailwind('text-xl font-bold text-gray-800')}>Edit Profile</Text>
              <TouchableOpacity onPress={handleCancel}>
                <Ionicons name="close" size={28} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Full Name */}
            <View style={tailwind('mb-4')}>
              <Text style={tailwind('text-sm text-gray-600 mb-2')}>Full Name</Text>
              <View style={[tailwind('flex-row items-center bg-gray-50 rounded-lg px-4 py-3'), { borderWidth: 1, borderColor: '#E5E7EB' }]}>
                <Ionicons name="person" size={20} color="#6B7280" style={tailwind('mr-3')} />
                <TextInput
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Enter your name"
                  style={tailwind('flex-1 text-base')}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Email (Read-only) */}
            <View style={tailwind('mb-4')}>
              <Text style={tailwind('text-sm text-gray-600 mb-2')}>Email Address</Text>
              <View style={[tailwind('flex-row items-center bg-gray-100 rounded-lg px-4 py-3'), { borderWidth: 1, borderColor: '#E5E7EB' }]}>
                <Ionicons name="mail" size={20} color="#9CA3AF" style={tailwind('mr-3')} />
                <Text style={tailwind('flex-1 text-base text-gray-400')}>{email}</Text>
                <Ionicons name="lock-closed" size={16} color="#9CA3AF" />
              </View>
              <Text style={tailwind('text-xs text-gray-400 mt-1')}>Email cannot be changed</Text>
            </View>

            {/* Phone */}
            <View style={tailwind('mb-6')}>
              <Text style={tailwind('text-sm text-gray-600 mb-2')}>Phone Number</Text>
              <View style={[tailwind('flex-row items-center bg-gray-50 rounded-lg px-4 py-3'), { borderWidth: 1, borderColor: '#E5E7EB' }]}>
                <Ionicons name="call" size={20} color="#6B7280" style={tailwind('mr-3')} />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Enter phone number"
                  keyboardType="phone-pad"
                  style={tailwind('flex-1 text-base')}
                />
              </View>
            </View>

            {/* Save Button */}
            <TouchableOpacity 
              onPress={save}
              disabled={saving}
              style={[tailwind('rounded-xl py-4 items-center mb-3'), { backgroundColor: saving ? '#D1D5DB' : '#6366F1' }]}
              activeOpacity={0.7}
            >
              {saving ? (
                <View style={tailwind('flex-row items-center')}>
                  <ActivityIndicator color="#FFFFFF" size="small" style={tailwind('mr-2')} />
                  <Text style={tailwind('text-white font-bold text-base')}>Saving...</Text>
                </View>
              ) : (
                <Text style={tailwind('text-white font-bold text-base')}>Save Changes</Text>
              )}
            </TouchableOpacity>

            {/* Cancel Button */}
            <TouchableOpacity 
              onPress={handleCancel}
              style={[tailwind('rounded-xl py-4 items-center'), { backgroundColor: '#F3F4F6' }]}
              activeOpacity={0.7}
            >
              <Text style={tailwind('text-gray-700 font-bold text-base')}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      <BottomNavigation navigation={navigation} activeRoute="Profile" role={role} />
    </View>
  );
}
