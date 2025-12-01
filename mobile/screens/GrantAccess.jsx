import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, getUsers, notifyIncident } from '../services/api';

export default function GrantAccessScreen({ navigation }) {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState({});
  const [selectedIncidents, setSelectedIncidents] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [incRes, usersRes] = await Promise.all([getIncidents(), getUsers()]);
      if (!incRes.success) {
        Alert.alert('Error', incRes.message || 'Failed to load incidents');
      } else {
        setIncidents(incRes.data || []);
      }

      if (!usersRes.success) {
        Alert.alert('Error', usersRes.message || 'Failed to load users');
      } else {
        setUsers(usersRes.data || []);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleUser = (userId) => {
    setSelectedUsers(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const toggleIncident = (incidentId) => {
    setSelectedIncidents(prev => ({ ...prev, [incidentId]: !prev[incidentId] }));
  };

  const submit = async () => {
    const incidentIds = Object.keys(selectedIncidents).filter(k => selectedIncidents[k]).map(id => Number(id));
    if (incidentIds.length === 0) return Alert.alert('Select incident(s)', 'Pick at least one incident to grant access for');
    const userIds = Object.keys(selectedUsers).filter(k => selectedUsers[k]).map(id => Number(id));
    if (userIds.length === 0) return Alert.alert('Select users', 'Pick at least one security user');

    setSubmitting(true);
    try {
      // Notify for each incident (backend expects single-incident notify endpoint)
      const promises = incidentIds.map(incId => notifyIncident(incId, userIds));
      const results = await Promise.all(promises);
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        console.warn('Some notifies failed', failed);
        Alert.alert('Partial Failure', `${failed.length} of ${results.length} notifications failed. Check logs.`);
      } else {
        Alert.alert('Success', `Notifications queued for ${userIds.length} users on ${incidentIds.length} incident(s)`);
        navigation.goBack();
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to notify users');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <View style={tailwind('flex-1 justify-center items-center')}><ActivityIndicator /></View>;

  const securityUsers = users.filter(u => u.role === 'security');

  return (
    <View style={tailwind('flex-1 p-4 bg-gray-100')}>
      <Text style={tailwind('text-2xl font-bold mb-4')}>Grant Access / Notify Security</Text>

      <Text style={tailwind('text-lg font-semibold mb-2')}>Select Incident(s)</Text>
      <FlatList
        data={incidents}
        keyExtractor={i => String(i.id)}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => toggleIncident(item.id)} style={tailwind(`p-3 rounded mb-2 ${selectedIncidents[item.id] ? 'bg-blue-50' : 'bg-white'}`)}>
            <View style={tailwind('flex-row justify-between items-center')}>
              <View>
                <Text style={tailwind('font-semibold')}>ID: {item.id} — {item.type}</Text>
                <Text style={tailwind('text-sm text-gray-600')}>{new Date(item.timestamp).toLocaleString()}</Text>
              </View>
              <View style={tailwind('bg-gray-200 px-3 py-1 rounded')}> 
                <Text>{selectedIncidents[item.id] ? 'Selected' : 'Select'}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />

      <Text style={tailwind('text-lg font-semibold mt-4 mb-2')}>Select Security Users</Text>
      <FlatList
        data={securityUsers}
        keyExtractor={u => String(u.id)}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => toggleUser(item.id)} style={tailwind('p-3 rounded mb-2 bg-white flex-row justify-between items-center')}>
            <View>
              <Text style={tailwind('font-semibold')}>{item.username || item.name}</Text>
              <Text style={tailwind('text-sm text-gray-600')}>{item.email}</Text>
            </View>
            <View style={tailwind('bg-gray-200 px-3 py-1 rounded')}> 
              <Text>{selectedUsers[item.id] ? 'Selected' : 'Select'}</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity onPress={submit} style={tailwind('bg-yellow-600 py-3 rounded mt-4 items-center')} disabled={submitting}>
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={tailwind('text-white font-bold')}>Grant Access & Notify Selected</Text>}
      </TouchableOpacity>
    </View>
  );
}
