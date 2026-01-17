// Temporary debug screen to check AsyncStorage tokens
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DebugStorageScreen() {
  const [storage, setStorage] = useState({});

  const loadStorage = async () => {
    const keys = ['adminToken', 'securityToken', 'viewerToken', 'userToken', 'user'];
    const values = {};
    
    for (const key of keys) {
      const val = await AsyncStorage.getItem(key);
      values[key] = val ? (key === 'user' ? JSON.parse(val) : val.substring(0, 20) + '...') : 'NULL';
    }
    
    setStorage(values);
  };

  useEffect(() => {
    loadStorage();
  }, []);

  return (
    <ScrollView style={{ flex: 1, padding: 20, backgroundColor: '#f5f5f5' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>AsyncStorage Debug</Text>
      
      {Object.entries(storage).map(([key, value]) => (
        <View key={key} style={{ backgroundColor: 'white', padding: 15, marginBottom: 10, borderRadius: 8 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 5 }}>{key}</Text>
          <Text style={{ fontSize: 12, color: '#666' }}>{JSON.stringify(value)}</Text>
        </View>
      ))}
      
      <TouchableOpacity 
        onPress={loadStorage}
        style={{ backgroundColor: '#6366F1', padding: 15, borderRadius: 8, marginTop: 20 }}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Refresh</Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        onPress={async () => {
          await AsyncStorage.multiRemove(['adminToken', 'securityToken', 'viewerToken', 'userToken', 'user']);
          loadStorage();
        }}
        style={{ backgroundColor: '#EF4444', padding: 15, borderRadius: 8, marginTop: 10 }}
      >
        <Text style={{ color: 'white', textAlign: 'center', fontWeight: 'bold' }}>Clear All Tokens</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
