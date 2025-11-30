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
        } else {
          navigation.navigate('ViewerLogin');
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
        {/* Admin option removed - only Security and Viewer available */}
        <View style={[tailwind('flex-row w-full'), { alignItems: 'center' }]}>
          <TouchableOpacity
            onPress={() => setRole('security')}
            style={[
              tailwind('py-3 px-6 rounded-lg border'),
              role === 'security' ? tailwind('bg-blue-500 border-blue-500') : tailwind('bg-white border-gray-300'),
              { flex: 1, marginRight: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
            ]}
          >
            <Text style={role === 'security' ? tailwind('text-white font-semibold') : tailwind('text-gray-700 font-semibold')}>Security</Text>
            {role === 'security' && <Text style={[tailwind('text-white'), { marginLeft: 8 }]}>✓</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setRole('viewer')}
            style={[
              tailwind('py-3 px-6 rounded-lg border'),
              role === 'viewer' ? tailwind('bg-green-500 border-green-500') : tailwind('bg-white border-gray-300'),
              { flex: 1, marginLeft: 6, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' },
            ]}
          >
            <Text style={role === 'viewer' ? tailwind('text-white font-semibold') : tailwind('text-gray-700 font-semibold')}>Viewer</Text>
            {role === 'viewer' && <Text style={[tailwind('text-white'), { marginLeft: 8 }]}>✓</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        onPress={handleRegister}
        style={tailwind('w-full bg-purple-600 py-4 rounded-lg flex-row items-center justify-center')}
      >
        <Text style={tailwind('text-white font-bold text-xl')}>Register</Text>
      </TouchableOpacity>

      {/* Footer: clearer prompt + role buttons */}
      <View style={tailwind('mt-6 w-full')}> 
        <Text style={tailwind('text-center text-gray-500 text-sm mb-3')}>Already have an account?</Text>

        <View style={[tailwind('flex-row w-full'), { justifyContent: 'space-between', paddingHorizontal: 4 }]}> 
          <TouchableOpacity
            onPress={() => navigation.navigate('ViewerLogin')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Viewer login"
            testID="login-viewer-footer"
            style={[
              tailwind('flex-1 py-3 rounded-lg items-center'),
              { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', marginHorizontal: 4 },
            ]}
          >
            <Text style={tailwind('text-gray-800 font-semibold')}>Viewer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('SecurityLogin')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Security login"
            testID="login-security-footer"
            style={[
              tailwind('flex-1 py-3 rounded-lg items-center'),
              { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', marginHorizontal: 4 },
            ]}
          >
            <Text style={tailwind('text-gray-800 font-semibold')}>Security</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('AdminLogin')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Admin login"
            testID="login-admin-footer"
            style={[
              tailwind('flex-1 py-3 rounded-lg items-center'),
              { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', marginHorizontal: 4 },
            ]}
          >
            <Text style={tailwind('text-gray-800 font-semibold')}>Admin</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

export default RegistrationScreen;