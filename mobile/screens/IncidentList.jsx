// screens/IncidentList.jsx
import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, StatusBar } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import useIncidents from '../hooks/useIncidents';
import { Ionicons } from '@expo/vector-icons';
import { getMe } from '../services/api';
import BottomNavigation from '../components/BottomNavigation';

const IncidentListScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const { incidents, loading, error, refreshIncidents, refreshing } = useIncidents();
  const [userRole, setUserRole] = useState('viewer');

  useEffect(() => {
    loadUserRole();
  }, []);

  const loadUserRole = async () => {
    try {
      const response = await getMe();
      if (response.success && response.data) {
        setUserRole(response.data.role || 'viewer');
      }
    } catch (e) {
      console.error('Load user role error:', e);
    }
  };

  const renderIncidentItem = ({ item }) => {
    const acknowledged = item.status === 'acknowledged' || item.acknowledged === true;
    const cameraInfo = item.camera?.admin_user?.username || item.camera?.name || 'Unknown';
    
    return (
      <TouchableOpacity
        style={[
          tailwind('bg-white mb-3 rounded-2xl overflow-hidden'),
          { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 }
        ]}
        onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
        activeOpacity={0.7}
      >
        {/* Header with Status Badge */}
        <View style={tailwind('flex-row justify-between items-center px-4 pt-4 pb-2')}>
          <Text style={tailwind('text-base font-bold text-gray-900')}>#{item.id}</Text>
          <View style={[tailwind('px-3 py-1 rounded-full'), { backgroundColor: acknowledged ? '#ECFDF5' : '#FEF2F2', marginLeft: 12 }]}>
            <Text style={[tailwind('text-xs font-semibold'), { color: acknowledged ? '#10B981' : '#EF4444', letterSpacing: 0.3 }]}>
              {acknowledged ? '✓  Acknowledged' : '!  Pending'}
            </Text>
          </View>
        </View>

        {/* Incident Details */}
        <View style={tailwind('px-4 pb-4')}>
          <View style={tailwind('flex-row items-center mb-2')}>
            <Ionicons name="alert-circle-outline" size={16} color="#9CA3AF" style={tailwind('mr-2')} />
            <Text style={tailwind('text-sm text-gray-700 font-medium')}>{item.type || 'Unknown Type'}</Text>
          </View>
          <View style={tailwind('flex-row items-center mb-2')}>
            <Ionicons name="person-outline" size={16} color="#9CA3AF" style={tailwind('mr-2')} />
            <Text style={tailwind('text-xs text-gray-600')}>{cameraInfo}</Text>
          </View>
          {item.assigned_user && (
            <View style={tailwind('flex-row items-center mb-2')}>
              <Ionicons name="bookmark-outline" size={16} color="#9CA3AF" style={tailwind('mr-2')} />
              <Text style={tailwind('text-xs text-gray-600')}>{item.assigned_user.username}</Text>
            </View>
          )}
          <View style={tailwind('flex-row items-center')}>
            <Ionicons name="time-outline" size={16} color="#9CA3AF" style={tailwind('mr-2')} />
            <Text style={tailwind('text-xs text-gray-500')}>
              {new Date(item.timestamp).toLocaleString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit', 
                minute: '2-digit' 
              })}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[tailwind('flex-1 justify-center items-center'), { backgroundColor: '#F9FAFB' }]}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={tailwind('text-gray-400 text-sm mt-3')}>Loading incidents...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[tailwind('flex-1 justify-center items-center'), { backgroundColor: '#F9FAFB' }]}>
        <View style={[tailwind('bg-white rounded-2xl p-8 items-center mx-5'), { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}>
          <Ionicons name="alert-circle" size={48} color="#EF4444" style={tailwind('mb-3')} />
          <Text style={tailwind('text-red-500 text-base font-semibold mb-2')}>Error Loading Incidents</Text>
          <Text style={tailwind('text-gray-500 text-sm text-center mb-4')}>{error}</Text>
          <TouchableOpacity 
            onPress={refreshIncidents} 
            style={[tailwind('rounded-xl py-3 px-6'), { backgroundColor: '#6366F1' }]}
            activeOpacity={0.8}
          >
            <Text style={tailwind('text-white font-semibold')}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[tailwind('flex-1'), { backgroundColor: '#F9FAFB' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      
      {/* Clean Header */}
      <View style={[tailwind('px-5'), { paddingTop: 50, paddingBottom: 20 }]}>
        <Text style={[tailwind('text-3xl font-bold mb-2'), { color: '#111827', letterSpacing: -0.5 }]}>
          All Incidents
        </Text>
        <Text style={tailwind('text-sm text-gray-500')}>
          View all system incidents
        </Text>
      </View>

      {incidents.length === 0 ? (
        <View style={tailwind('px-5')}>
          <View style={[tailwind('bg-white rounded-2xl p-12 items-center'), { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}>
            <Text style={tailwind('text-5xl mb-3')}>✓</Text>
            <Text style={tailwind('text-gray-900 text-base font-semibold mb-1')}>All Clear</Text>
            <Text style={tailwind('text-gray-400 text-sm text-center')}>No incidents to display</Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={incidents}
          renderItem={renderIncidentItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={refreshIncidents}
              tintColor="#6366F1"
              colors={['#6366F1']}
            />
          }
        />
      )}
      
      <BottomNavigation navigation={navigation} activeRoute="IncidentList" role={userRole} />
    </View>
  );
};

export default IncidentListScreen;