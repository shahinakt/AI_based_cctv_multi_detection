// screens/ViewerLogin.jsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { loginUser, registerPushToken } from '../services/api';
import PrimaryButton from '../components/PrimaryButton';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ViewerLoginScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      console.log('[ViewerLogin] Starting login...');
      
      // Clear all old tokens first to prevent conflicts
      await AsyncStorage.multiRemove(['viewerToken', 'securityToken', 'adminToken', 'userToken', 'viewerUser', 'securityUser', 'user']);
      console.log('[ViewerLogin] Cleared all old tokens');
      
      const response = await loginUser(email, password, 'viewer');
      console.log('[ViewerLogin] Login response:', response);
      
      if (response.success) {
        console.log('[ViewerLogin] Login successful, fetching user profile...');
        
        // Fetch actual user profile from backend to ensure correct data
        try {
          const { getMe } = require('../services/api');
          const profileResponse = await getMe();
          
          if (profileResponse.success && profileResponse.data) {
            const user = profileResponse.data;
            console.log('[ViewerLogin] User profile fetched:', user);
            
            // Verify user role is viewer
            if (user.role !== 'viewer') {
              console.warn('[ViewerLogin] User role mismatch - expected viewer, got:', user.role);
              Alert.alert(
                'Access Denied',
                `This login is for viewers only. Your account is registered as ${user.role}. Please use the correct login.`,
                [
                  {
                    text: 'OK',
                    onPress: async () => {
                      await AsyncStorage.multiRemove(['userToken', 'user']);
                    }
                  }
                ]
              );
              return;
            }
            
            // Save correct user data
            await AsyncStorage.setItem('user', JSON.stringify(user));
            console.log('[ViewerLogin] Viewer user verified and saved');
          }
        } catch (profileError) {
          console.error('[ViewerLogin] Error fetching user profile:', profileError);
        }
        
        // Attempt to register push token if available (non-blocking)
        try {
          const token = await AsyncStorage.getItem('expoPushToken');
          const authToken = await AsyncStorage.getItem('userToken');
          if (token && authToken) {
            registerPushToken(token, authToken).then(reg => {
              if (!reg.success) console.warn('Push token registration failed:', reg.message);
            }).catch(e => console.warn('Push token registration error:', e));
          }
        } catch (e) {
          console.warn('Error registering push token', e);
        }
        
        // Navigate immediately
        navigation.replace('ViewerDashboard');
      } else {
        const msg = response.message || 'Invalid credentials.';
        console.warn('[ViewerLogin] Login failed:', msg);
        Alert.alert('Login Failed', msg);
      }
    } catch (error) {
      console.error('[ViewerLogin] Login error:', error);
      Alert.alert('Error', 'An error occurred during login.');
    }
  };

  return (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-100 p-4')}>
      <Text style={tailwind('text-3xl font-bold mb-8 text-gray-800')}>Viewer Login</Text>
      <TextInput
        style={tailwind('w-full p-4 mb-4 bg-white rounded-lg border border-gray-300 text-lg')}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={tailwind('w-full p-4 mb-6 bg-white rounded-lg border border-gray-300 text-lg')}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <PrimaryButton title="Login" onPress={handleLogin} />
      <TouchableOpacity
        onPress={() => navigation.navigate('Registration')}
        style={tailwind('mt-6')}
      >
        <Text style={tailwind('text-green-600 text-base')}>Don't have an account? Register</Text>
      </TouchableOpacity>
    </View>
  );
};

export default ViewerLoginScreen;