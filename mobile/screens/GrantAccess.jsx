import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, StatusBar, ScrollView } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, getUsers, notifyIncident } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import BottomNavigation from '../components/BottomNavigation';

export default function GrantAccessScreen({ navigation }) {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
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
        console.log('Loaded users:', usersRes.data);
        console.log('Security users:', usersRes.data?.filter(u => u.role === 'security'));
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

  const selectUser = useCallback((userId) => {
    setSelectedUser(prev => prev === userId ? null : userId);
  }, []);

  const toggleIncident = useCallback((incidentId) => {
    setSelectedIncidents(prev => ({ ...prev, [incidentId]: !prev[incidentId] }));
  }, []);

  const submit = async () => {
    const incidentIds = Object.keys(selectedIncidents).filter(k => selectedIncidents[k]).map(id => Number(id));
    if (incidentIds.length === 0) return Alert.alert('Select Incidents', 'Please select at least one incident');
    
    if (!selectedUser) return Alert.alert('Select Security', 'Please select one security personnel');

    setSubmitting(true);
    console.log('[GrantAccess] Starting assignment:', { incidentIds, selectedUser });
    
    try {
      const results = await Promise.all(
        incidentIds.map(async incId => {
          try {
            console.log(`[GrantAccess] Calling notifyIncident for incident ${incId} with user ${selectedUser}`);
            const res = await notifyIncident(incId, [selectedUser]);
            console.log(`[GrantAccess] Response for incident ${incId}:`, res);
            return res;
          } catch (err) {
            console.error(`[GrantAccess] Error for incident ${incId}:`, err);
            return { success: false, message: err.message || 'Unknown error' };
          }
        })
      );
      
      console.log('[GrantAccess] All results:', results);
      const succeeded = results.filter(r => r && r.success);
      const failed = results.filter(r => !r || !r.success);
      
      setSubmitting(false);
      
      if (succeeded.length > 0) {
        Alert.alert(
          'Success',
          `Assigned ${succeeded.length} incident(s) to security personnel.${failed.length > 0 ? ` ${failed.length} failed.` : ''}`,
          [{ text: 'OK', onPress: () => navigation.goBack() }]
        );
      } else {
        console.error('[GrantAccess] All assignments failed:', failed);
        Alert.alert('Error', `Failed to assign incidents: ${failed[0]?.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('[GrantAccess] Assignment error:', err);
      setSubmitting(false);
      Alert.alert('Error', `An error occurred: ${err.message || 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <View style={[tailwind('flex-1 justify-center items-center'), { backgroundColor: '#F9FAFB' }]}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={tailwind('text-gray-400 text-sm mt-3')}>Loading...</Text>
      </View>
    );
  }

  const securityUsers = users.filter(u => u.role === 'security');
  console.log('Rendering - Total users:', users.length, 'Security users:', securityUsers.length);
  const selectedIncidentCount = Object.keys(selectedIncidents).filter(k => selectedIncidents[k]).length;
  const hasSelectedUser = selectedUser !== null;

  return (
    <View style={[tailwind('flex-1'), { backgroundColor: '#F9FAFB' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={[tailwind('bg-white px-5 border-b border-gray-100'), { paddingTop: 50, paddingBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 2 }]}>
        <Text style={[tailwind('text-2xl font-bold mb-2'), { color: '#111827' }]}>
          Assign Security
        </Text>
        <Text style={tailwind('text-sm text-gray-500')}>
          Select incidents and security personnel
        </Text>
      </View>

      <ScrollView 
        style={tailwind('flex-1')} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View style={tailwind('px-5 pt-5')}>
          {/* Selection Summary Card */}
          <View style={[tailwind('bg-white rounded-2xl p-4 mb-4 flex-row'), { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}>
            <View style={tailwind('flex-1 items-center pr-3')}>
              <Text style={tailwind('text-xs text-gray-400 mb-1')}>INCIDENTS</Text>
              <Text style={[tailwind('text-3xl font-bold'), { color: '#6366F1' }]}>{selectedIncidentCount}</Text>
            </View>
            <View style={tailwind('flex-1 items-center')}>
              <Text style={tailwind('text-xs text-gray-400 mb-1')}>ASSIGNED TO</Text>
              <Text style={[tailwind('text-2xl font-bold'), { color: '#8B5CF6' }]}>{hasSelectedUser ? '1' : '0'}</Text>
            </View>
          </View>

          {/* Incidents Section with Scrollable List */}
          <Text style={tailwind('text-xs text-gray-400 font-semibold mb-3 px-1 tracking-wide')}>
            SELECT INCIDENTS ({incidents.length})
          </Text>
          
          {incidents.length === 0 ? (
            <View style={[tailwind('bg-white rounded-2xl p-6 items-center mb-4'), { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}>
              <Text style={tailwind('text-gray-400 text-sm')}>No incidents</Text>
            </View>
          ) : (
            <View style={[tailwind('bg-white rounded-2xl mb-4 overflow-hidden'), { height: 220, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}>
              <FlatList
                data={incidents}
                keyExtractor={(item) => `incident-${item.id}`}
                showsVerticalScrollIndicator={true}
                removeClippedSubviews={true}
                maxToRenderPerBatch={15}
                windowSize={5}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    onPress={() => toggleIncident(item.id)} 
                    style={[
                      tailwind('border-b border-gray-100'),
                      { 
                        backgroundColor: selectedIncidents[item.id] ? '#EEF2FF' : '#FFFFFF',
                      }
                    ]}
                    activeOpacity={0.7}
                  >
                    <View style={tailwind('px-4 py-3 flex-row items-center')}>
                      <View style={[
                        tailwind('w-5 h-5 rounded-full items-center justify-center mr-3'),
                        { backgroundColor: selectedIncidents[item.id] ? '#6366F1' : '#E5E7EB' }
                      ]}>
                        {selectedIncidents[item.id] && (
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                        )}
                      </View>
                      <View style={tailwind('flex-1')}>
                        <Text style={[tailwind('font-bold text-sm'), { color: selectedIncidents[item.id] ? '#4F46E5' : '#111827' }]}>
                          #{item.id}
                        </Text>
                        <Text style={tailwind('text-xs text-gray-400')}>
                          {new Date(item.timestamp).toLocaleString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Security Users Section with Scrollable List */}
          <Text style={tailwind('text-xs text-gray-400 font-semibold mb-3 px-1 tracking-wide')}>
            SELECT SECURITY ({securityUsers.length})
          </Text>
          
          {securityUsers.length === 0 ? (
            <View style={[tailwind('bg-white rounded-2xl p-6 items-center mb-4'), { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}>
              <Text style={tailwind('text-gray-400 text-sm')}>No security users</Text>
            </View>
          ) : (
            <View style={[tailwind('bg-white rounded-2xl mb-4 overflow-hidden'), { height: 200, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }]}>
              <FlatList
                data={securityUsers}
                keyExtractor={(item) => `user-${item.id}`}
                showsVerticalScrollIndicator={true}
                removeClippedSubviews={true}
                maxToRenderPerBatch={10}
                windowSize={5}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    onPress={() => selectUser(item.id)} 
                    style={[
                      tailwind('border-b border-gray-100'),
                      { 
                        backgroundColor: selectedUser === item.id ? '#F3E8FF' : '#FFFFFF',
                      }
                    ]}
                    activeOpacity={0.7}
                  >
                    <View style={tailwind('px-4 py-3 flex-row items-center')}>
                      <View style={[
                        tailwind('w-5 h-5 rounded-full items-center justify-center mr-3'),
                        { backgroundColor: selectedUser === item.id ? '#8B5CF6' : '#E5E7EB' }
                      ]}>
                        {selectedUser === item.id && (
                          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                        )}
                      </View>
                      <View style={tailwind('flex-1')}>
                        <Text style={[tailwind('font-bold text-sm'), { color: selectedUser === item.id ? '#7C3AED' : '#111827' }]}>
                          {item.username || item.name}
                        </Text>
                        <Text style={tailwind('text-xs text-gray-400')}>
                          {item.email}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}

          {/* Submit Button */}
          <TouchableOpacity 
            onPress={() => {
              console.log('Button pressed - Incident count:', selectedIncidentCount, 'Has user:', hasSelectedUser);
              submit();
            }}
            style={[
              tailwind('rounded-2xl py-4 items-center justify-center mb-4 mx-0'),
              { 
                backgroundColor: (submitting || selectedIncidentCount === 0 || !hasSelectedUser) ? '#D1D5DB' : '#6366F1',
                shadowColor: (submitting || selectedIncidentCount === 0 || !hasSelectedUser) ? '#D1D5DB' : '#6366F1',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: (submitting || selectedIncidentCount === 0 || !hasSelectedUser) ? 0.1 : 0.3,
                shadowRadius: 8,
                elevation: (submitting || selectedIncidentCount === 0 || !hasSelectedUser) ? 2 : 4
              }
            ]} 
            disabled={submitting || selectedIncidentCount === 0 || !hasSelectedUser}
            activeOpacity={0.7}
          >
            {submitting ? (
              <View style={tailwind('flex-row items-center')}>
                <ActivityIndicator color="#FFFFFF" size="small" style={tailwind('mr-2')} />
                <Text style={tailwind('text-white font-bold text-base')}>Assigning...</Text>
              </View>
            ) : (
              <View style={tailwind('flex-row items-center')}>
                <Ionicons name="notifications" size={20} color="#FFFFFF" style={tailwind('mr-2')} />
                <Text style={tailwind('text-white font-bold text-base')}>
                  Assign & Notify
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      
      <BottomNavigation navigation={navigation} activeRoute="GrantAccess" role="admin" />
    </View>
  );
}
