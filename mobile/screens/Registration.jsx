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
      console.log('[Registration] Starting registration...');
      const response = await registerUser(name, email, password, role);
      console.log('[Registration] Registration response:', response);
      
      if (response.success) {
        console.log('[Registration] Registration successful, navigating to login...');
        
        // Navigate immediately to login screen
        if (role === 'security') {
          navigation.navigate('SecurityLogin');
        } else if (role === 'admin') {
          navigation.navigate('AdminLogin');
        } else {
          navigation.navigate('ViewerLogin');
        }
        
        // Show success message after navigation
        setTimeout(() => {
          Alert.alert('Success', 'Registration successful! Please log in.');
        }, 100);
      } else {
        const msg = response.message || 'Registration failed.';
        console.warn('[Registration] Registration failed:', msg);
        Alert.alert('Registration Failed', msg);
      }
    } catch (error) {
      console.error('[Registration] Registration error:', error);
      Alert.alert('Error', error.message || 'An error occurred during registration.');
    }
  };

  return (
    <ScrollView 
      contentContainerStyle={tailwind('flex-grow justify-start items-center bg-gray-100 p-6')}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[tailwind('text-2xl font-bold mb-1 text-gray-800 text-center'), { marginTop: 24, letterSpacing: -0.5 }]}>Surveillance Monitoring</Text>
      <Text style={tailwind('text-xs text-gray-500 mb-6 text-center')}>Create your account</Text>
      {__DEV__ && (
        <TouchableOpacity onPress={() => navigation.navigate('DevDebug')} style={[tailwind('mb-4 py-2 px-4 rounded bg-yellow-300')]}> 
          <Text style={tailwind('text-black font-semibold')}>Open Dev Debug</Text>
        </TouchableOpacity>
      )}
      <TextInput
        style={[tailwind('w-full p-4 mb-3 text-base'), { borderRadius: 8, borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', outlineColor: '#000000' }]} 
        placeholder="Name"
        placeholderTextColor="#9CA3AF"
        value={name}
        onChangeText={setName}
        selectionColor="#000000"
        cursorColor="#000000"
      />
      <TextInput
        style={[tailwind('w-full p-4 mb-3 text-base'), { borderRadius: 8, borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', outlineColor: '#000000' }]}
        placeholder="Email"
        placeholderTextColor="#9CA3AF"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        selectionColor="#000000"
        cursorColor="#000000"
      />
      <TextInput
        style={[tailwind('w-full p-4 mb-5 text-base'), { borderRadius: 8, borderWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', outlineColor: '#000000' }]}
        placeholder="Password"
        placeholderTextColor="#9CA3AF"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        selectionColor="#000000"
        cursorColor="#000000"
      />

      <View style={tailwind('w-full mb-5')}>
        <Text style={tailwind('text-sm font-semibold mb-2 text-gray-700')}>Account Type</Text>
        {/* Admin option removed - only Security and Viewer available */}
        <View style={tailwind('w-full')}>
          <TouchableOpacity
            onPress={() => setRole('security')}
            style={[
              tailwind('flex-row items-center py-3 px-4 mb-2'),
              { borderRadius: 8, borderWidth: 2, borderColor: role === 'security' ? '#3B82F6' : '#E5E7EB', backgroundColor: '#FFFFFF' },
            ]}
          >
            <View style={[
              tailwind('items-center justify-center'),
              { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: role === 'security' ? '#3B82F6' : '#9CA3AF', marginRight: 12 }
            ]}>
              {role === 'security' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6' }} />}
            </View>
            <Text style={tailwind('text-sm font-semibold text-gray-800')}>Security Personnel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setRole('viewer')}
            style={[
              tailwind('flex-row items-center py-3 px-4 mb-4'),
              { borderRadius: 8, borderWidth: 2, borderColor: role === 'viewer' ? '#3B82F6' : '#E5E7EB', backgroundColor: '#FFFFFF' },
            ]}
          >
            <View style={[
              tailwind('items-center justify-center'),
              { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: role === 'viewer' ? '#3B82F6' : '#9CA3AF', marginRight: 12 }
            ]}>
              {role === 'viewer' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6' }} />}
            </View>
            <Text style={tailwind('text-sm font-semibold text-gray-800')}>Viewer</Text>
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
              tailwind('flex-1 py-3 rounded-lg items-center justify-center'),
              { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', marginHorizontal: 4 },
            ]}
          >
            <Text style={tailwind('text-gray-800 font-semibold text-center')}>Viewer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('SecurityLogin')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Security login"
            testID="login-security-footer"
            style={[
              tailwind('flex-1 py-3 rounded-lg items-center justify-center'),
              { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', marginHorizontal: 4 },
            ]}
          >
            <Text style={tailwind('text-gray-800 font-semibold text-center')}>Security</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('AdminLogin')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Admin login"
            testID="login-admin-footer"
            style={[
              tailwind('flex-1 py-3 rounded-lg items-center justify-center'),
              { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', marginHorizontal: 4 },
            ]}
          >
            <Text style={tailwind('text-gray-800 font-semibold text-center')}>Admin</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

export default RegistrationScreen;