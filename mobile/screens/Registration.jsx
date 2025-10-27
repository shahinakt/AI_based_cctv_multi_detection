// screens/Registration.jsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { registerUser } from '../services/api';

const RegistrationScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer'); // Default role

  const handleRegister = async () => {
    if (!name || !email || !password || !role) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    try {
      const response = await registerUser(name, email, password, role);
      if (response.success) {
        Alert.alert('Success', 'Registration successful! Please log in.');
        // Redirect to appropriate login screen based on role
        if (role === 'security') {
          navigation.navigate('SecurityLogin');
        } else if (role === 'viewer') {
          navigation.navigate('ViewerLogin');
        } else if (role === 'admin') {
          navigation.navigate('AdminLogin');
        }
      } else {
        Alert.alert('Registration Failed', response.message || 'Something went wrong.');
      }
    } catch (error) {
      console.error('Registration error:', error);
      Alert.alert('Error', 'An error occurred during registration.');
    }
  };

  return (
    <ScrollView contentContainerStyle={tailwind('flex-grow justify-center items-center bg-gray-100 p-4')}>
      <Text style={tailwind('text-3xl font-bold mb-8 text-gray-800')}>Register</Text>
      <TextInput
        style={tailwind('w-full p-4 mb-4 bg-white rounded-lg border border-gray-300 text-lg')}
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />
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

      <View style={tailwind('w-full mb-6')}>
        <Text style={tailwind('text-lg font-semibold mb-2 text-gray-700')}>Select Role:</Text>
        <View style={tailwind('flex-row justify-around')}>
          <TouchableOpacity
            onPress={() => setRole('security')}
            style={tailwind(`py-3 px-6 rounded-lg border ${role === 'security' ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'}`)}
          >
            <Text style={tailwind(`${role === 'security' ? 'text-white' : 'text-gray-700'} font-semibold`)}>Security</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setRole('viewer')}
            style={tailwind(`py-3 px-6 rounded-lg border ${role === 'viewer' ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'}`)}
          >
            <Text style={tailwind(`${role === 'viewer' ? 'text-white' : 'text-gray-700'} font-semibold`)}>Viewer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setRole('admin')}
            style={tailwind(`py-3 px-6 rounded-lg border ${role === 'admin' ? 'bg-red-500 border-red-500' : 'bg-white border-gray-300'}`)}
          >
            <Text style={tailwind(`${role === 'admin' ? 'text-white' : 'text-gray-700'} font-semibold`)}>Admin</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        onPress={handleRegister}
        style={tailwind('w-full bg-purple-600 py-4 rounded-lg flex-row items-center justify-center')}
      >
        <Text style={tailwind('text-white font-bold text-xl')}>Register</Text>
      </TouchableOpacity>

      <View style={tailwind('mt-8 flex-row justify-around w-full')}>
        <TouchableOpacity onPress={() => navigation.navigate('SecurityLogin')}>
          <Text style={tailwind('text-blue-600 text-base')}>Login as Security</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('ViewerLogin')}>
          <Text style={tailwind('text-green-600 text-base')}>Login as Viewer</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('AdminLogin')}>
          <Text style={tailwind('text-red-600 text-base')}>Login as Admin</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

export default RegistrationScreen;