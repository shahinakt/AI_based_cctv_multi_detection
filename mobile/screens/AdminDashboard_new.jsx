// screens/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, acknowledgeIncident, grantAccessToIncident } from '../services/api';
import BottomNavigation from '../components/BottomNavigation';

const AdminDashboardScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});

  const fetchIncidents = async () => {
    setLoadingIncidents(true);
    try {
      const response = await getIncidents();
      if (response.success) {
        setIncidents(response.data);
      } else {
        Alert.alert('Error', response.message || 'Failed to fetch incidents.');
      }
    } catch (error) {
      console.error('Error fetching incidents:', error);
    } finally {
      setLoadingIncidents(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
    setRefreshing(false);
  };

  const acknowledge = async (incidentId) => {
    try {
      setActionLoading(prev => ({ ...prev, [incidentId]: true }));
      const res = await acknowledgeIncident(incidentId);
      if (res.success) {
        await fetchIncidents();
        Alert.alert('Success', 'Incident acknowledged');
      } else {
        Alert.alert('Error', res.message || 'Failed to acknowledge incident');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to acknowledge incident');
    } finally {
      setActionLoading(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  const grantAccess = (incidentId) => {
    navigation.navigate('GrantAccess', { incidentId });
  };

  const renderIncidentItem = ({ item }) => {
    const ownerName = item.owner?.name || item.owner_name || 'Unknown';
    const cameraName = item.camera?.name || item.camera_name || 'Unknown';
    const acknowledged = item.status === 'acknowledged' || item.acknowledged === true;

    return (
      <TouchableOpacity
        style={tailwind('bg-white p-4 mb-3 rounded-lg shadow')}
        onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
      >
        <View style={tailwind('flex-row justify-between items-start')}>
          <View style={tailwind('flex-1')}>
            <Text style={tailwind('text-lg font-bold text-gray-800')}>Incident ID: {item.id}</Text>
            <Text style={tailwind('text-sm text-gray-600')}>Owner: {ownerName}</Text>
            <Text style={tailwind('text-sm text-gray-600')}>Camera: {cameraName}</Text>
            <Text style={tailwind('text-sm text-gray-500')}>
              Time: {new Date(item.timestamp).toLocaleString()}
            </Text>
          </View>
          
          <View style={tailwind('items-end')}>
            <View style={[tailwind('px-2 py-1 rounded'), { backgroundColor: acknowledged ? '#10B981' : '#EF4444' }]}>
              <Text style={tailwind('text-white text-xs font-semibold')}>
                {acknowledged ? 'Acknowledged' : 'Unacknowledged'}
              </Text>
            </View>
          </View>
        </View>

        <View style={tailwind('flex-row mt-3')}>
          <TouchableOpacity
            style={[tailwind('flex-1 py-2 rounded mr-2'), { backgroundColor: '#3B82F6' }]}
            onPress={() => acknowledge(item.id)}
            disabled={!!actionLoading[item.id]}
          >
            {actionLoading[item.id] ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={tailwind('text-white text-center font-semibold')}>
                {acknowledged ? 'Revoke' : 'Acknowledge'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[tailwind('flex-1 py-2 rounded'), { backgroundColor: '#F59E0B' }]}
            onPress={() => grantAccess(item.id)}
          >
            <Text style={tailwind('text-white text-center font-semibold')}>Assign Security</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={tailwind('flex-1 bg-gray-100')}>
      {/* Header */}
      <View style={[tailwind('bg-blue-600 p-4'), { paddingTop: 40 }]}>
        <Text style={tailwind('text-white text-2xl font-bold')}>Admin Dashboard</Text>
        <Text style={tailwind('text-blue-100 text-sm')}>Manage incidents and security personnel</Text>
      </View>

      <ScrollView
        style={tailwind('flex-1')}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={tailwind('p-4')}>
          <View style={tailwind('flex-row justify-between items-center mb-4')}>
            <Text style={tailwind('text-xl font-bold text-gray-800')}>
              Recent Incidents ({incidents.length})
            </Text>
          </View>

          {loadingIncidents ? (
            <ActivityIndicator size="large" color="#3B82F6" style={tailwind('my-8')} />
          ) : incidents.length === 0 ? (
            <View style={tailwind('bg-white p-8 rounded-lg items-center')}>
              <Text style={tailwind('text-gray-500 text-center')}>No incidents to display</Text>
            </View>
          ) : (
            <FlatList
              data={incidents}
              renderItem={renderIncidentItem}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
            />
          )}
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNavigation navigation={navigation} activeRoute="AdminDashboard" role="admin" />
    </View>
  );
};

export default AdminDashboardScreen;
