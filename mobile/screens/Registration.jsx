// screens/Registration.jsx
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { registerUser, getDebugInfo } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PrimaryButton from '../components/PrimaryButton';

const RegistrationScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('viewer'); // Default role

  const handleRegister = async () => {
    // Log debug info to help diagnose network issues (BASE_URL, manifest)
    try {
      console.debug('[Registration] debugInfo:', getDebugInfo());
    } catch (e) {
      // ignore
    }
    if (!name || !email || !password || !role) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }

    try {
      const response = await registerUser(name, email, password, role);
      console.debug('Registration response:', response);
      if (response.success) {
        Alert.alert('Success', response.message || 'Registration successful! Please log in.');
        // If we have a saved expo push token, remind user to login so we can register it server-side
        try {
          const token = await AsyncStorage.getItem('expoPushToken');
          if (token) {
            Alert.alert('Push Notifications', 'Device push token is saved locally. Please log in so we can register this device for push notifications.');
          }
        } catch (e) {
          // ignore storage errors
        }
        // Redirect to appropriate login screen based on role
        if (role === 'security') {
          navigation.navigate('SecurityLogin');
        } else {
          navigation.navigate('ViewerLogin');
        }
      } else {
        const msg = response.message || (response.data ? JSON.stringify(response.data) : 'Something went wrong.');
        console.warn('Registration failed:', msg);
        Alert.alert('Registration Failed', msg);
      }
    } catch (error) {
      console.error('Registration error:', error);
      Alert.alert('Error', error.message || 'An error occurred during registration.');
    }
  };

  return (
    <ScrollView contentContainerStyle={tailwind('flex-grow justify-start items-center bg-gray-100 p-6')}>
      <Text style={[tailwind('text-4xl font-bold mb-8 text-gray-800 text-center'), { marginTop: 18 }]}>Register</Text>
      {__DEV__ && (
        <TouchableOpacity onPress={() => navigation.navigate('DevDebug')} style={[tailwind('mb-4 py-2 px-4 rounded bg-yellow-300')]}> 
          <Text style={tailwind('text-black font-semibold')}>Open Dev Debug</Text>
        </TouchableOpacity>
      )}
      <TextInput
        style={[tailwind('w-full p-5 mb-4 bg-gray-100 text-lg'), { borderRadius: 12, borderWidth: 1, borderColor: '#0f172a' }]} 
        placeholder="Name"
        placeholderTextColor="#6b7280"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={[tailwind('w-full p-5 mb-4 bg-gray-100 text-lg'), { borderRadius: 12, borderWidth: 1, borderColor: '#0f172a' }]}
        placeholder="Email"
        placeholderTextColor="#6b7280"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={[tailwind('w-full p-5 mb-6 bg-gray-100 text-lg'), { borderRadius: 12, borderWidth: 1, borderColor: '#0f172a' }]}
        placeholder="Password"
        placeholderTextColor="#6b7280"
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
              tailwind('py-3 px-4 border'),
              role === 'security' ? tailwind('bg-blue-500 border-blue-500') : tailwind('bg-white'),
              { flex: 1, marginRight: 8, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: role === 'security' ? undefined : '#0f172a' },
            ]}
          >
            <Text style={role === 'security' ? tailwind('text-white font-semibold') : tailwind('text-gray-700 font-semibold')}>Security</Text>
            {role === 'security' && <Text style={[tailwind('text-white'), { marginLeft: 8 }]}>✓</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setRole('viewer')}
            style={[
              tailwind('py-3 px-4 border'),
              role === 'viewer' ? tailwind('bg-blue-500 border-blue-500') : tailwind('bg-white'),
              { flex: 1, marginLeft: 8, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: role === 'viewer' ? undefined : '#0f172a' },
            ]}
          >
            <Text style={role === 'viewer' ? tailwind('text-white font-semibold') : tailwind('text-gray-700 font-semibold')}>Viewer</Text>
            {role === 'viewer' && <Text style={[tailwind('text-white'), { marginLeft: 8 }]}>✓</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <PrimaryButton title="Register" onPress={handleRegister} />

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