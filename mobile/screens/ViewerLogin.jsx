// screens/ViewerLogin.jsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { loginUser } from '../services/api';

const ViewerLoginScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      const response = await loginUser(email, password, 'viewer');
      if (response.success) {
        Alert.alert('Success', 'Logged in as Viewer.');
        navigation.replace('ViewerDashboard');
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
      <TouchableOpacity
        onPress={handleLogin}
        style={tailwind('w-full bg-green-600 py-4 rounded-lg flex-row items-center justify-center')}
      >
        <Text style={tailwind('text-white font-bold text-xl')}>Login</Text>
      </TouchableOpacity>
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