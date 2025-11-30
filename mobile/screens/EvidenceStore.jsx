import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getIncidents } from '../services/api';

export default function EvidenceStore({ navigation }) {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);

  useEffect(() => { fetch(); }, []);

  const fetch = async () => {
    const res = await getIncidents();
    if (res.success) setIncidents(res.data || []);
    else Alert.alert('Error', res.message || 'Failed to load incidents');
  };

  const flattenEvidence = incidents.flatMap(i => (i.evidence || []).map(e => ({ ...e, incidentId: i.id })));

  return (
    <View style={tailwind('flex-1 bg-sky-50 p-4')}>
      <Text style={tailwind('text-2xl font-bold mb-4 text-sky-700')}>Evidence Store</Text>
      {flattenEvidence.length === 0 ? (
        <Text style={tailwind('text-sky-600')}>No evidence uploaded yet.</Text>
      ) : (
        <FlatList
          data={flattenEvidence}
          keyExtractor={(item, idx) => `${item.incidentId}-${idx}`}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => navigation.navigate('IncidentDetail', { incident: { id: item.incidentId, evidence: [item] } })}
              style={tailwind('mb-4 bg-white rounded-lg p-3 border border-sky-100 shadow')}
            >
              <View style={tailwind('flex-row justify-between items-center')}> 
                <Text style={tailwind('font-semibold text-sky-800')}>Incident #{item.incidentId}</Text>
                <Text style={tailwind('text-xs text-sky-600')}>Hash: {item.hash}</Text>
              </View>
              <Image source={{ uri: item.url }} style={{ width: '100%', height: 180, marginTop: 8, borderRadius: 8 }} resizeMode="cover" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
