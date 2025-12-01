import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getDebugInfo, setOverrideBaseUrl, resolveBaseUrl } from '../services/api';

const DevDebugScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [override, setOverride] = useState('');
  const [info, setInfo] = useState(null);
  const [resolved, setResolved] = useState('');

  useEffect(() => {
    try {
      const d = getDebugInfo();
      setInfo(d);
      // resolve base
      (async () => {
        try {
          const b = await resolveBaseUrl();
          setResolved(b);
        } catch (e) {
          setResolved('<error>');
        }
      })();
    } catch (e) {
      // ignore
    }
  }, []);

  const save = async () => {
    try {
      await setOverrideBaseUrl(override.trim() || null);
      Alert.alert('Saved', 'Override saved. Restart app or re-open this screen.');
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const clear = async () => {
    try {
      await setOverrideBaseUrl(null);
      setOverride('');
      Alert.alert('Cleared', 'Override removed.');
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  return (
    <View style={tailwind('flex-1 p-6 bg-gray-100')}>
      <Text style={tailwind('text-2xl font-bold mb-4')}>Dev Debug</Text>
      <Text style={tailwind('mb-2')}>Configured BASE_URL: {info ? info.BASE_URL : 'loading...'}</Text>
      <Text style={tailwind('mb-2')}>Resolved at runtime: {resolved}</Text>
      <Text style={tailwind('font-semibold mt-4 mb-2')}>Set Override (e.g. http://192.168.1.100:8000)</Text>
      <TextInput
        style={tailwind('w-full p-3 bg-white rounded mb-4 border')}
        placeholder="http://<YOUR_PC_IP>:8000"
        value={override}
        onChangeText={setOverride}
        autoCapitalize="none"
      />
      <View style={tailwind('flex-row')}> 
        <TouchableOpacity onPress={save} style={[tailwind('py-3 px-4 rounded mr-2 bg-blue-500')]}> 
          <Text style={tailwind('text-white font-semibold')}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clear} style={[tailwind('py-3 px-4 rounded bg-gray-300')]}> 
          <Text style={tailwind('text-gray-800 font-semibold')}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default DevDebugScreen;
