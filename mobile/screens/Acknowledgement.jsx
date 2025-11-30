import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Linking } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getIncidents, createIncident } from '../services/api';

const EMERGENCY_KEY = 'emergency_contact_number';

export default function AcknowledgementScreen({ navigation }) {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [emergencyContact, setEmergencyContact] = useState(null);

  useEffect(() => {
    (async () => {
      const v = await AsyncStorage.getItem(EMERGENCY_KEY);
      if (v) setEmergencyContact(v);
    })();
    fetch();
  }, []);

  const fetch = async () => {
    const res = await getIncidents();
    if (res.success) setIncidents(res.data || []);
    else Alert.alert('Error', res.message || 'Failed to load incidents');
  };

  const markSeen = (incidentId) => {
    // For viewer acknowledgement: mark locally and inform backend if desired
    setIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, seen_by_user: true } : i));
    Alert.alert('Marked', 'Marked as seen');
  };

  const markUnseen = async (incident) => {
    // If user marks unseen, treat as emergency: create an SOS incident and call emergency contact
    Alert.alert(
      'Report Unseen Incident',
      'Marking unseen will trigger emergency procedures. Proceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Proceed', style: 'destructive', onPress: async () => {
          // Create emergency incident
          const payload = {
            camera_id: incident.camera_id || null,
            type: 'fall_health',
            severity: 'critical',
            severity_score: 100,
            description: `Viewer reported unseen incident: ${incident.id}`,
          };
          const res = await createIncident(payload);
          if (res.success) {
            Alert.alert('Reported', 'Emergency incident created.');
            // call emergency contact if present
            if (emergencyContact) {
              try {
                await Linking.openURL(`tel:${emergencyContact}`);
              } catch (e) {
                console.warn('Call failed', e);
                Alert.alert('Call failed', `Unable to call ${emergencyContact}`);
              }
            }
          } else {
            Alert.alert('Failed', res.message || 'Could not report incident');
          }
        } }
      ]
    );
  };

  return (
    <View style={tailwind('flex-1 bg-sky-50 p-4')}>
      <Text style={tailwind('text-2xl font-bold mb-4 text-sky-700')}>Acknowledge / Report</Text>
      <Text style={tailwind('text-sm text-sky-600 mb-3')}>Mark incidents you have seen. If you mark one as unseen, an SOS will be triggered and your emergency contact will be called.</Text>

      <FlatList
        data={incidents}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={tailwind('bg-white p-4 mb-3 rounded-lg border border-sky-100')}> 
            <Text style={tailwind('font-semibold text-sky-800')}>Incident #{item.id} • {item.type}</Text>
            <Text style={tailwind('text-xs text-sky-500 mt-1')}>Time: {new Date(item.timestamp).toLocaleString()}</Text>
            <View style={tailwind('flex-row mt-3')}> 
              <TouchableOpacity onPress={() => markSeen(item.id)} style={tailwind('mr-2 px-3 py-2 bg-sky-600 rounded')}>
                <Text style={tailwind('text-white')}>I've seen</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => markUnseen(item)} style={tailwind('px-3 py-2 bg-red-600 rounded')}>
                <Text style={tailwind('text-white')}>I have NOT seen</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}
