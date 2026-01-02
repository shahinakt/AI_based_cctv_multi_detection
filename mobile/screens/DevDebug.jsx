import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ScrollView, Platform } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getDebugInfo, setOverrideBaseUrl, resolveBaseUrl } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DevDebugScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [override, setOverride] = useState('');
  const [info, setInfo] = useState(null);
  const [resolved, setResolved] = useState('');

  const loadInfo = async () => {
    try {
      const d = getDebugInfo();
      setInfo(d);
      const b = await resolveBaseUrl();
      setResolved(b);
    } catch (e) {
      setResolved('<error>');
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const save = async () => {
    try {
      await setOverrideBaseUrl(override.trim() || null);
      Alert.alert('Saved', 'Override saved. Restart app or refresh this screen.');
      await loadInfo();
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const clear = async () => {
    try {
      await setOverrideBaseUrl(null);
      setOverride('');
      Alert.alert('Cleared', 'Override removed. Refresh this screen to see changes.');
      await loadInfo();
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const clearAllCache = async () => {
    try {
      await AsyncStorage.clear();
      setOverride('');
      Alert.alert('Cache Cleared', 'All AsyncStorage cleared. App will use default platform URLs. Restart the app.');
      await loadInfo();
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  return (
    <ScrollView style={tailwind('flex-1 bg-gray-100')}>
      <View style={tailwind('p-6')}>
        <Text style={tailwind('text-2xl font-bold mb-4')}>🛠️ Dev Debug</Text>
        
        <View style={tailwind('bg-white p-4 rounded-lg mb-4')}>
          <Text style={tailwind('font-bold mb-2 text-lg')}>Platform Info</Text>
          <Text style={tailwind('mb-1')}>Platform.OS: <Text style={tailwind('font-mono')}>{Platform.OS}</Text></Text>
          <Text style={tailwind('mb-1')}>Configured BASE_URL: <Text style={tailwind('font-mono text-xs')}>{info ? info.BASE_URL : 'loading...'}</Text></Text>
          <Text style={tailwind('mb-1')}>Resolved at runtime: <Text style={tailwind('font-mono text-xs')}>{resolved}</Text></Text>
        </View>

        <View style={tailwind('bg-yellow-50 p-4 rounded-lg mb-4 border border-yellow-200')}>
          <Text style={tailwind('font-bold mb-2 text-yellow-800')}>⚠️ Platform-Specific URLs</Text>
          <Text style={tailwind('text-xs mb-1')}>• Web: http://localhost:8000</Text>
          <Text style={tailwind('text-xs mb-1')}>• Android Emulator: http://10.0.2.2:8000</Text>
          <Text style={tailwind('text-xs mb-1')}>• iOS Simulator: http://localhost:8000</Text>
          <Text style={tailwind('text-xs')}>• Physical Device: http://YOUR_IP:8000</Text>
        </View>

        <Text style={tailwind('font-semibold mb-2')}>Override BASE_URL (Optional)</Text>
        <Text style={tailwind('text-xs text-gray-600 mb-2')}>For physical devices, enter your computer's IP</Text>
        <TextInput
          style={tailwind('w-full p-3 bg-white rounded mb-4 border border-gray-300')}
          placeholder="http://192.168.1.100:8000"
          value={override}
          onChangeText={setOverride}
          autoCapitalize="none"
        />
        
        <View style={tailwind('flex-row mb-4')}> 
          <TouchableOpacity onPress={save} style={[tailwind('py-3 px-4 rounded mr-2 bg-blue-500')]}> 
            <Text style={tailwind('text-white font-semibold')}>Save Override</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clear} style={[tailwind('py-3 px-4 rounded bg-gray-400')]}> 
            <Text style={tailwind('text-white font-semibold')}>Clear Override</Text>
          </TouchableOpacity>
        </View>

        <View style={tailwind('bg-red-50 p-4 rounded-lg border border-red-200')}>
          <Text style={tailwind('font-bold mb-2 text-red-800')}>🗑️ Clear All Cache</Text>
          <Text style={tailwind('text-xs text-red-700 mb-3')}>
            This will clear ALL stored data including tokens and overrides. Use this if you're having connection issues.
          </Text>
          <TouchableOpacity onPress={clearAllCache} style={[tailwind('py-3 px-4 rounded bg-red-500')]}> 
            <Text style={tailwind('text-white font-semibold text-center')}>Clear All Cache & Restart</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
};

export default DevDebugScreen;
