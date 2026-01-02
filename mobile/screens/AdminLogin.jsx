// screens/AdminLogin.jsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { loginUser, registerPushToken } from '../services/api';
import PrimaryButton from '../components/PrimaryButton';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AdminLoginScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password.');
      return;
    }

    console.log('[AdminLogin] Attempting login with:', email);
    
    try {
      console.log('[AdminLogin] Calling loginUser API...');
      const response = await loginUser(email, password, 'admin');
      console.log('[AdminLogin] Login response:', response);
      
      if (response.success) {
        console.log('[AdminLogin] Login successful, navigating to dashboard...');
        
        // Register push token (non-blocking)
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
        navigation.replace('AdminDashboard');
      } else {
        Alert.alert('Login Failed', response.message || 'Invalid credentials.');
      }
    } catch (error) {
      console.error('[AdminLogin] Login error:', error);
      Alert.alert('Error', 'Cannot connect to backend server. Is it running on port 8000?');
    }
  };

  return (
    <View style={tailwind('flex-1 justify-center items-center bg-gray-100 p-4')}>
      <Text style={tailwind('text-3xl font-bold mb-8 text-gray-800')}>Admin Login</Text>
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
      {/* Registration link removed by request */}
    </View>
  );
};

export default AdminLoginScreen;