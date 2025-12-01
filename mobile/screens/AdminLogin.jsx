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
    try {
      const response = await loginUser(email, password, 'admin');
      if (response.success) {
        Alert.alert('Success', response.message || 'Logged in as Admin.');
        try {
          const token = await AsyncStorage.getItem('expoPushToken');
          const authToken = await AsyncStorage.getItem('userToken');
          if (token && authToken) {
            const reg = await registerPushToken(token, authToken);
            if (!reg.success) console.warn('Push token registration after login failed:', reg.message);
          }
        } catch (e) {
          console.warn('Error registering push token after login', e);
        }
        navigation.replace('AdminDashboard');
      } else {
        Alert.alert('Login Failed', response.message || 'Invalid credentials.');
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', 'An error occurred during login.');
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