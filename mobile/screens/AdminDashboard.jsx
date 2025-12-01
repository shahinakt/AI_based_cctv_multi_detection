// screens/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, acknowledgeIncident } from '../services/api';
import { grantAccessToIncident } from '../services/api';
import { Swipeable, RectButton, ScrollView } from 'react-native-gesture-handler';

const AdminDashboardScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserPanel, setShowUserPanel] = useState(false);

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
      Alert.alert('Error', 'An error occurred while fetching incidents.');
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
      if (!res.success) {
        Alert.alert('Error', res.message || 'Failed to acknowledge incident');
      } else {
        await fetchIncidents();
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to acknowledge incident');
    } finally {
      setActionLoading(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  const grantAccess = async (incidentId) => {
    try {
      setActionLoading(prev => ({ ...prev, [incidentId]: true }));
      const res = await grantAccessToIncident(incidentId, 'security');
      if (!res.success) {
        Alert.alert('Error', res.message || 'Failed to grant access');
      } else {
        Alert.alert('Success', 'Security access granted for this incident');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to grant access');
    } finally {
      setActionLoading(prev => ({ ...prev, [incidentId]: false }));
    }
  };

  const openUserPanel = (user) => {
    setSelectedUser(user || null);
    setShowUserPanel(true);
  };

  const renderRightActions = (item) => (
    <View style={tailwind('flex-row items-center') }>
      <RectButton style={tailwind('bg-blue-600 px-4 py-3 rounded-l-lg')} onPress={() => openUserPanel(item.owner || item)}>
        <Text style={tailwind('text-white font-semibold')}>Profile</Text>
      </RectButton>
      <RectButton style={tailwind('bg-yellow-600 px-4 py-3 rounded-r-lg ml-1')} onPress={() => grantAccess(item.id)}>
        <Text style={tailwind('text-white font-semibold')}>Grant</Text>
      </RectButton>
    </View>
  );

  const renderIncidentItem = ({ item }) => {
    const ownerName = item.owner?.name || item.owner_name || item.ownerName || 'Unknown';
    const cameraName = item.camera?.name || item.camera_name || item.cameraName || 'Unknown';
    const acknowledged = item.status === 'acknowledged' || item.acknowledged === true;

    return (
      <Swipeable renderRightActions={() => renderRightActions(item)}>
        <TouchableOpacity
          style={tailwind('bg-white p-4 mb-3 rounded-lg shadow-md')}
          onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
        >
          <View style={tailwind('flex-row items-center justify-between')}>
            <View style={tailwind('flex-1') }>
              <Text style={tailwind('text-lg font-bold text-gray-800')}>Incident ID: {item.id}</Text>
              <Text style={tailwind('text-sm text-gray-600')}>Owner: {ownerName}</Text>
              <Text style={tailwind('text-sm text-gray-600')}>Camera: {cameraName}</Text>
              <Text style={tailwind('text-sm text-gray-500')}>Time: {new Date(item.timestamp).toLocaleString()}</Text>
            </View>
            <View style={tailwind('items-end ml-2')}>
              <Text style={tailwind(`text-sm font-semibold ${acknowledged ? 'text-green-600' : 'text-red-600'}`)}>
                {acknowledged ? 'Acknowledged' : 'Unacknowledged'}
              </Text>
              <TouchableOpacity
                style={tailwind('mt-2 bg-indigo-600 px-3 py-1 rounded')}
                onPress={() => acknowledge(item.id)}
                disabled={!!actionLoading[item.id]}
              >
                {actionLoading[item.id] ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={tailwind('text-white')}>{acknowledged ? 'Revoke' : 'Acknowledge'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={tailwind('flex-1 bg-gray-100')}>
      <ScrollView
        style={tailwind('flex-1 p-4')}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Camera feeds removed from admin dashboard - incidents only */}

        <View style={tailwind('flex-row items-center justify-between') }>
          <Text style={tailwind('text-2xl font-bold mt-6 mb-4 text-gray-800')}>Recent Incidents</Text>
          <View style={tailwind('flex-row') }>
            <TouchableOpacity onPress={() => navigation.navigate('GrantAccess')} style={tailwind('mt-6 bg-yellow-600 px-3 py-2 rounded mr-2')}>
              <Text style={tailwind('text-white')}>Grant Access</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('AdminProfile')} style={tailwind('mt-6 bg-sky-600 px-3 py-2 rounded')}>
              <Text style={tailwind('text-white')}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
        {loadingIncidents ? (
          <ActivityIndicator size="large" color="#0000ff" style={tailwind('my-4')} />
        ) : incidents.length === 0 ? (
          <Text style={tailwind('text-gray-600 text-center my-4')}>No incidents to display.</Text>
        ) : (
          <FlatList
            data={incidents}
            renderItem={renderIncidentItem}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
          />
        )}
      </ScrollView>

      {/* Side user profile panel */}
      {showUserPanel && selectedUser && (
        <View style={tailwind('absolute inset-y-0 right-0 w-3/4 bg-white shadow-lg p-4')}> 
          <View style={tailwind('flex-row justify-between items-center mb-4')}>
            <Text style={tailwind('text-xl font-bold')}>{selectedUser.name || selectedUser.username || 'User'}</Text>
            <TouchableOpacity onPress={() => { setShowUserPanel(false); setSelectedUser(null); }} style={tailwind('px-3 py-1 bg-gray-200 rounded')}>
              <Text>Close</Text>
            </TouchableOpacity>
          </View>

          <Text style={tailwind('text-sm text-gray-600 mb-2')}>Email: {selectedUser.email || '—'}</Text>
          <Text style={tailwind('text-sm text-gray-600 mb-4')}>Role: {selectedUser.role || '—'}</Text>

          <Text style={tailwind('text-lg font-semibold mb-2')}>Incidents (owned)</Text>
          <FlatList
            data={incidents.filter(i => (i.owner?.id || i.owner_id || i.ownerId) && String(i.owner?.id || i.owner_id || i.ownerId) === String(selectedUser.id || selectedUser.user_id || selectedUser.id))}
            keyExtractor={(it) => `u-${it.id}`}
            renderItem={({ item }) => (
              <View style={tailwind('bg-gray-50 p-3 rounded mb-3') }>
                <Text style={tailwind('font-semibold')}>ID: {item.id} — {item.type}</Text>
                <Text style={tailwind('text-sm text-gray-600')}>Time: {new Date(item.timestamp).toLocaleString()}</Text>
                <View style={tailwind('flex-row mt-2')}>
                  <TouchableOpacity style={tailwind('bg-indigo-600 px-3 py-1 rounded mr-2')} onPress={() => acknowledge(item.id)}>
                    <Text style={tailwind('text-white')}>Acknowledge</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={tailwind('bg-yellow-600 px-3 py-1 rounded')} onPress={() => grantAccess(item.id)}>
                    <Text style={tailwind('text-white')}>Grant Security</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      )}
    </View>
  );
};

export default AdminDashboardScreen;