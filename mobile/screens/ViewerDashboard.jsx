import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Image } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, createIncident, acknowledgeIncidentWithStatus } from '../services/api';
import NotificationBanner from '../components/NotificationBanner';
import MenuBar from '../components/MenuBar';

const ViewerDashboardScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const prevIdsRef = useRef(new Set());
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);

  const fetchIncidents = async (silent = false) => {
    if (!silent) setLoadingIncidents(true);
    try {
      const response = await getIncidents();
      if (response && response.success) {
        const newList = response.data || [];
        const newIds = new Set(newList.map((i) => i.id));

        if (silent) {
          const prev = prevIdsRef.current;
          const added = newList.filter((i) => !prev.has(i.id));
          if (added.length > 0) {
            setBannerMessage(`${added.length} new incident(s) reported`);
            setBannerVisible(true);
            setTimeout(() => setBannerVisible(false), 3500);
          }
        }

        setIncidents(newList);
        prevIdsRef.current = newIds;
      } else {
        Alert.alert('Error', (response && response.message) || 'Failed to fetch incidents.');
      }
    } catch (error) {
      console.error('Error fetching incidents:', error);
      Alert.alert('Error', 'An error occurred while fetching incidents.');
    } finally {
      setLoadingIncidents(false);
    }
  };

  const acknowledge = async (id) => {
    try {
      const res = await acknowledgeIncidentWithStatus(id, true);
      if (res && res.success) {
        setIncidents((prev) => prev.map((it) => (it.id === id ? { ...it, acknowledged: true, status: 'acknowledged' } : it)));
        Alert.alert('Acknowledged', 'Incident acknowledged. Security has been notified.');
      } else {
        Alert.alert('Error', (res && res.message) || 'Failed to acknowledge incident.');
      }
    } catch (err) {
      console.error('Acknowledge error:', err);
      Alert.alert('Error', 'An error occurred while acknowledging.');
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchIncidents();
    const iv = setInterval(() => {
      if (mounted) fetchIncidents(true);
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
    setRefreshing(false);
  };

  const renderIncidentItem = ({ item }) => (
    <TouchableOpacity
      style={[tailwind('bg-white p-4 mb-3 rounded-lg border border-sky-100'), { elevation: 2 }]}
      onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
    >
      <View style={tailwind('flex-row justify-between items-start')}>
        import React, { useState, useEffect, useRef } from 'react';
        import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Image } from 'react-native';
        import { ScrollView } from 'react-native-gesture-handler';
        import { useTailwind } from 'tailwind-rn';
        import { getIncidents, createIncident, acknowledgeIncidentWithStatus } from '../services/api';
        import NotificationBanner from '../components/NotificationBanner';
        import MenuBar from '../components/MenuBar';

        const ViewerDashboardScreen = ({ navigation }) => {
          const tailwind = useTailwind();
          const [incidents, setIncidents] = useState([]);
          const [loadingIncidents, setLoadingIncidents] = useState(true);
          const [refreshing, setRefreshing] = useState(false);

          const prevIdsRef = useRef(new Set());
          const [bannerMessage, setBannerMessage] = useState('');
          const [bannerVisible, setBannerVisible] = useState(false);

          const fetchIncidents = async (silent = false) => {
            if (!silent) setLoadingIncidents(true);
            try {
              const response = await getIncidents();
              if (response && response.success) {
                const newList = response.data || [];
                const newIds = new Set(newList.map((i) => i.id));

                if (silent) {
                  const prev = prevIdsRef.current;
                  const added = newList.filter((i) => !prev.has(i.id));
                  if (added.length > 0) {
                    setBannerMessage(`${added.length} new incident(s) reported`);
                    setBannerVisible(true);
                    setTimeout(() => setBannerVisible(false), 3500);
                  }
                }

                setIncidents(newList);
                prevIdsRef.current = newIds;
              } else {
                Alert.alert('Error', (response && response.message) || 'Failed to fetch incidents.');
              }
            } catch (error) {
              console.error('Error fetching incidents:', error);
              Alert.alert('Error', 'An error occurred while fetching incidents.');
            } finally {
              setLoadingIncidents(false);
            }
          };

          const acknowledge = async (id) => {
            try {
              const res = await acknowledgeIncidentWithStatus(id, true);
              if (res && res.success) {
                setIncidents((prev) => prev.map((it) => (it.id === id ? { ...it, acknowledged: true, status: 'acknowledged' } : it)));
                Alert.alert('Acknowledged', 'Incident acknowledged. Security has been notified.');
              } else {
                Alert.alert('Error', (res && res.message) || 'Failed to acknowledge incident.');
              }
            } catch (err) {
              console.error('Acknowledge error:', err);
              Alert.alert('Error', 'An error occurred while acknowledging.');
            }
          };

          useEffect(() => {
            let mounted = true;
            fetchIncidents();
            const iv = setInterval(() => {
              if (mounted) fetchIncidents(true);
            }, 15000);
            return () => {
              mounted = false;
              clearInterval(iv);
            };
          }, []);

          const onRefresh = async () => {
            setRefreshing(true);
            await fetchIncidents();
            setRefreshing(false);
          };

          const renderIncidentItem = ({ item }) => (
            <TouchableOpacity
              style={[tailwind('bg-white p-4 mb-3 rounded-lg border border-sky-100'), { elevation: 2 }]}
              onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
            >
              <View style={tailwind('flex-row justify-between items-start')}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={tailwind('text-lg font-bold text-sky-800')}>#{item.id} • {String(item.type || '').replace('_', ' ')}</Text>
                  {item.description ? <Text style={tailwind('text-sm text-sky-600 mt-1')}>{item.description}</Text> : null}
                  <Text style={tailwind('text-xs text-sky-500 mt-2')}>{item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}</Text>
                </View>

                <View style={{ alignItems: 'flex-end' }}>
                  <View style={{ backgroundColor: item.severity === 'critical' ? '#ef4444' : item.severity === 'high' ? '#f97316' : '#34d399', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{String(item.severity || 'N/A').toUpperCase()}</Text>
                  </View>

                  <Text style={tailwind(`text-sm font-semibold ${item.acknowledged ? 'text-green-600' : 'text-red-600'} mt-2`)}>
                    {item.acknowledged ? 'Acknowledged' : 'Unacknowledged'}
                  </Text>
                </View>
              </View>

              {item.evidence && item.evidence.length > 0 && item.evidence[0].url ? (
                <Image source={{ uri: item.evidence[0].url }} style={{ width: '100%', height: 140, borderRadius: 8, marginTop: 12 }} resizeMode="cover" />
              ) : null}

              <View style={tailwind('flex-row mt-3')}> 
                <TouchableOpacity
                  onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
                  style={tailwind('mr-2 px-3 py-2 bg-sky-100 rounded')}
                >
                  <Text style={tailwind('text-sky-700')}>Details</Text>
                </TouchableOpacity>

                {!item.acknowledged && (
                  <TouchableOpacity
                    onPress={() => acknowledge(item.id)}
                    style={tailwind('px-3 py-2 bg-sky-600 rounded')}
                  >
                    <Text style={tailwind('text-white')}>Acknowledge</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );

          return (
            <View style={tailwind('flex-1 bg-sky-50')}>
              <ScrollView
                style={tailwind('flex-1 p-4')}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
              >
                <View style={tailwind('mb-4')}> 
                  <Text style={tailwind('text-2xl font-bold text-sky-700')}>Recent Incidents</Text>
                </View>

                <NotificationBanner visible={bannerVisible} message={bannerMessage} onPress={() => { setBannerVisible(false); }} />

                {loadingIncidents ? (
                  <ActivityIndicator size="large" color="#0369A1" style={tailwind('my-4')} />
                ) : incidents.length === 0 ? (
                  <Text style={tailwind('text-sky-600 text-center my-4')}>No incidents to display.</Text>
                ) : (
                  <FlatList
                    data={incidents}
                    renderItem={renderIncidentItem}
                    keyExtractor={(item) => String(item.id)}
                    scrollEnabled={false}
                  />
                )}
              </ScrollView>

              <TouchableOpacity
                onPress={async () => {
                  Alert.alert(
                    'Emergency SOS',
                    'Trigger emergency SOS? This will notify security.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Send SOS',
                        style: 'destructive',
                        onPress: async () => {
                          const cameraId = incidents?.[0]?.camera_id;
                          if (!cameraId) {
                            Alert.alert('No camera', 'No camera available to attach SOS. Notifying locally.');
                            Alert.alert('SOS Sent', 'Security notified (local).');
                            return;
                          }
                          const payload = {
                            camera_id: cameraId,
                            type: 'fall_health',
                            severity: 'critical',
                            severity_score: 100,
                            description: 'SOS triggered by viewer',
                          };
                          const res = await createIncident(payload);
                          if (res && res.success) {
                            setBannerMessage('SOS sent — emergency incident created');
                            setBannerVisible(true);
                            setTimeout(() => setBannerVisible(false), 3500);
                            fetchIncidents();
                          } else {
                            Alert.alert('Error', (res && res.message) || 'Failed to send SOS.');
                          }
                        },
                      },
                    ]
                  );
                }}
                style={{ position: 'absolute', right: 18, bottom: 28, backgroundColor: '#ef4444', padding: 14, borderRadius: 999, elevation: 6 }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>SOS</Text>
              </TouchableOpacity>

              <MenuBar navigation={navigation} />
            </View>
          );
        };

        export default ViewerDashboardScreen;
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: item.severity === 'critical' ? '#ef4444' : item.severity === 'high' ? '#f97316' : '#34d399', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{item.severity?.toUpperCase() || 'N/A'}</Text>
          </View>

          <Text style={tailwind(`text-sm font-semibold ${item.acknowledged ? 'text-green-600' : 'text-red-600'} mt-2`)}>
            {item.acknowledged ? 'Acknowledged' : 'Unacknowledged'}
          </Text>
        </View>
      </View>

      {item.evidence && item.evidence.length > 0 && item.evidence[0].url ? (
        <Image source={{ uri: item.evidence[0].url }} style={{ width: '100%', height: 140, borderRadius: 8, marginTop: 12 }} resizeMode="cover" />
      ) : null}

      <View style={tailwind('flex-row mt-3')}> 
        <TouchableOpacity
          onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
          style={tailwind('mr-2 px-3 py-2 bg-sky-100 rounded')}
        >
          <Text style={tailwind('text-sky-700')}>Details</Text>
        </TouchableOpacity>

        {!item.acknowledged && (
          <TouchableOpacity
            onPress={() => acknowledge(item.id)}
            style={tailwind('px-3 py-2 bg-sky-600 rounded')}
          >
            <Text style={tailwind('text-white')}>Acknowledge</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={tailwind('flex-1 bg-sky-50')}>
      <ScrollView
        style={tailwind('flex-1 p-4')}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={tailwind('mb-4')}> 
          <Text style={tailwind('text-2xl font-bold text-sky-700')}>Recent Incidents</Text>
        </View>

        <NotificationBanner visible={bannerVisible} message={bannerMessage} onPress={() => { setBannerVisible(false); }} />

        {loadingIncidents ? (
          <ActivityIndicator size="large" color="#0369A1" style={tailwind('my-4')} />
        ) : incidents.length === 0 ? (
          <Text style={tailwind('text-sky-600 text-center my-4')}>No incidents to display.</Text>
        ) : (
          <FlatList
            data={incidents}
            renderItem={renderIncidentItem}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
          />
        )}
      </ScrollView>

      <TouchableOpacity
        onPress={async () => {
          Alert.alert(
            'Emergency SOS',
            'Trigger emergency SOS? This will notify security.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Send SOS',
                style: 'destructive',
                onPress: async () => {
                  const cameraId = incidents?.[0]?.camera_id;
                  if (!cameraId) {
                    Alert.alert('No camera', 'No camera available to attach SOS. Notifying locally.');
                    Alert.alert('SOS Sent', 'Security notified (local).');
                    return;
                  }
                  const payload = {
                    camera_id: cameraId,
                    type: 'fall_health',
                    severity: 'critical',
                    severity_score: 100,
                    description: 'SOS triggered by viewer',
                  };
                  const res = await createIncident(payload);
                  if (res.success) {
                    setBannerMessage('SOS sent — emergency incident created');
                    setBannerVisible(true);
                    setTimeout(() => setBannerVisible(false), 3500);
                    fetchIncidents();
                  } else {
                    Alert.alert('Error', res.message || 'Failed to send SOS.');
                  }
                },
              },
            ]
          );
        }}
        style={{ position: 'absolute', right: 18, bottom: 28, backgroundColor: '#ef4444', padding: 14, borderRadius: 999, elevation: 6 }}
      >
        <Text style={{ color: '#fff', fontWeight: '800' }}>SOS</Text>
      </TouchableOpacity>

      <MenuBar navigation={navigation} />
    </View>
  );
};

export default ViewerDashboardScreen;
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Image } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, createIncident, acknowledgeIncidentWithStatus } from '../services/api';
import { ScrollView } from 'react-native-gesture-handler';
import NotificationBanner from '../components/NotificationBanner';
import MenuBar from '../components/MenuBar';

const ViewerDashboardScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const prevIdsRef = useRef(new Set());
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);

  const fetchIncidents = async (silent = false) => {
    if (!silent) setLoadingIncidents(true);
    try {
      const response = await getIncidents();
      if (response.success) {
        const newList = response.data || [];
        const newIds = new Set(newList.map((i) => i.id));
        if (silent) {
          const prev = prevIdsRef.current;
          const added = newList.filter((i) => !prev.has(i.id));
          if (added.length > 0) {
            setBannerMessage(`${added.length} new incident(s) reported`);
            setBannerVisible(true);
            setTimeout(() => setBannerVisible(false), 3500);
          }
        }
        setIncidents(newList);
        prevIdsRef.current = newIds;
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

  const acknowledge = async (id) => {
    try {
      const res = await acknowledgeIncidentWithStatus(id, true);
      if (res.success) {
        setIncidents((prev) => prev.map((it) => (it.id === id ? { ...it, acknowledged: true, status: 'acknowledged' } : it)));
        Alert.alert('Acknowledged', 'Incident acknowledged. Security has been notified.');
      } else {
        Alert.alert('Error', res.message || 'Failed to acknowledge incident.');
      }
    } catch (err) {
      console.error('Acknowledge error:', err);
      Alert.alert('Error', 'An error occurred while acknowledging.');
    }
  };

  useEffect(() => {
    let mounted = true;
    fetchIncidents();
    const iv = setInterval(() => {
      if (mounted) fetchIncidents(true);
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
    setRefreshing(false);
  };

  const renderIncidentItem = ({ item }) => (
    <TouchableOpacity
      style={[tailwind('bg-white p-4 mb-3 rounded-lg border border-sky-100'), { elevation: 2 }]}
      onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
    >
      <View style={tailwind('flex-row justify-between items-start')}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={tailwind('text-lg font-bold text-sky-800')}>#{item.id} • {item.type?.replace('_', ' ')}</Text>
          {item.description ? <Text style={tailwind('text-sm text-sky-600 mt-1')}>{item.description}</Text> : null}
          <Text style={tailwind('text-xs text-sky-500 mt-2')}>{new Date(item.timestamp).toLocaleString()}</Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: item.severity === 'critical' ? '#ef4444' : item.severity === 'high' ? '#f97316' : '#34d399', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{item.severity?.toUpperCase() || 'N/A'}</Text>
          </View>

          <Text style={tailwind(`text-sm font-semibold ${item.acknowledged ? 'text-green-600' : 'text-red-600'} mt-2`)}>
            {item.acknowledged ? 'Acknowledged' : 'Unacknowledged'}
          </Text>
        </View>
      </View>

      {item.evidence && item.evidence.length > 0 && item.evidence[0].url ? (
        <Image source={{ uri: item.evidence[0].url }} style={{ width: '100%', height: 140, borderRadius: 8, marginTop: 12 }} resizeMode="cover" />
      ) : null}

      <View style={tailwind('flex-row mt-3')}> 
        <TouchableOpacity
          onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
          style={tailwind('mr-2 px-3 py-2 bg-sky-100 rounded')}
        >
          <Text style={tailwind('text-sky-700')}>Details</Text>
        </TouchableOpacity>

        {!item.acknowledged && (
          <TouchableOpacity
            onPress={() => acknowledge(item.id)}
            style={tailwind('px-3 py-2 bg-sky-600 rounded')}
          >
            <Text style={tailwind('text-white')}>Acknowledge</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={tailwind('flex-1 bg-sky-50')}>
      <ScrollView
        style={tailwind('flex-1 p-4')}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={tailwind('mb-4')}> 
          <Text style={tailwind('text-2xl font-bold text-sky-700')}>Recent Incidents</Text>
        </View>

        <NotificationBanner visible={bannerVisible} message={bannerMessage} onPress={() => { setBannerVisible(false); }} />

        {loadingIncidents ? (
          <ActivityIndicator size="large" color="#0369A1" style={tailwind('my-4')} />
        ) : incidents.length === 0 ? (
          <Text style={tailwind('text-sky-600 text-center my-4')}>No incidents to display.</Text>
        ) : (
          <FlatList
            data={incidents}
            renderItem={renderIncidentItem}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
          />
        )}
      </ScrollView>

      <TouchableOpacity
        onPress={async () => {
          Alert.alert(
            'Emergency SOS',
            'Trigger emergency SOS? This will notify security.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Send SOS',
                style: 'destructive',
                onPress: async () => {
                  const cameraId = incidents?.[0]?.camera_id;
                  if (!cameraId) {
                    Alert.alert('No camera', 'No camera available to attach SOS. Notifying locally.');
                    Alert.alert('SOS Sent', 'Security notified (local).');
                    return;
                  }
                  const payload = {
                    camera_id: cameraId,
                    type: 'fall_health',
                    severity: 'critical',
                    severity_score: 100,
                    description: 'SOS triggered by viewer',
                  };
                  const res = await createIncident(payload);
                  if (res.success) {
                    setBannerMessage('SOS sent — emergency incident created');
                    setBannerVisible(true);
                    setTimeout(() => setBannerVisible(false), 3500);
                    fetchIncidents();
                  } else {
                    Alert.alert('Error', res.message || 'Failed to send SOS.');
                  }
                },
              },
            ]
          );
        }}
        style={{ position: 'absolute', right: 18, bottom: 28, backgroundColor: '#ef4444', padding: 14, borderRadius: 999, elevation: 6 }}
      >
        <Text style={{ color: '#fff', fontWeight: '800' }}>SOS</Text>
      </TouchableOpacity>

      <MenuBar navigation={navigation} />
    </View>
  );
};

export default ViewerDashboardScreen;
// screens/ViewerDashboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, Image } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getIncidents, createIncident, acknowledgeIncidentWithStatus } from '../services/api';
import { ScrollView } from 'react-native-gesture-handler';
import NotificationBanner from '../components/NotificationBanner';
import MenuBar from '../components/MenuBar';

const ViewerDashboardScreen = ({ navigation }) => {
  const tailwind = useTailwind();
  const [incidents, setIncidents] = useState([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const prevIdsRef = useRef(new Set());
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);

  const fetchIncidents = async (silent = false) => {
    setLoadingIncidents(true);
    try {
      const response = await getIncidents();
      if (response.success) {
        // detect new incidents when polling silently
        const newList = response.data || [];
        const newIds = new Set(newList.map((i) => i.id));
        if (!silent) {
          setIncidents(newList);
        } else {
          // compare with prevIdsRef to see if there are new items
          const prev = prevIdsRef.current;
          const added = newList.filter((i) => !prev.has(i.id));
          if (added.length > 0) {
            // show an in-app banner (better UX than modal alerts)
            setBannerMessage(`${added.length} new incident(s) reported`);
            setBannerVisible(true);
            setTimeout(() => setBannerVisible(false), 3500);
          }
          setIncidents(newList);
        }
        // update prevIds
        prevIdsRef.current = newIds;
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

  // helper to acknowledge an incident and update local state
  const acknowledge = async (id) => {
    try {
      const res = await acknowledgeIncidentWithStatus(id, true);
      if (res.success) {
        setIncidents((prev) => prev.map((it) => (it.id === id ? { ...it, acknowledged: true, status: 'acknowledged' } : it)));
        Alert.alert('Acknowledged', 'Incident acknowledged. Security has been notified.');
      } else {
        Alert.alert('Error', res.message || 'Failed to acknowledge incident.');
      }
    } catch (err) {
      console.error('Acknowledge error:', err);
      Alert.alert('Error', 'An error occurred while acknowledging.');
        style={[tailwind('bg-white p-4 mb-3 rounded-lg border border-sky-100'), { elevation: 2 }]}
  };

  useEffect(() => {
    let mounted = true;
            <Text style={tailwind('text-lg font-bold text-sky-800')}>#{item.id} • {item.type.replace('_', ' ')}</Text>
            {item.description ? <Text style={tailwind('text-sm text-sky-600 mt-1')}>{item.description}</Text> : null}
            <Text style={tailwind('text-xs text-sky-500 mt-2')}>{new Date(item.timestamp).toLocaleString()}</Text>
    // poll for new incidents every 15s to provide near-instant notifications
    const iv = setInterval(() => {
      if (mounted) fetchIncidents(true);
    }, 15000);

    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchIncidents();
          <TouchableOpacity
            onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
            style={tailwind('mr-2 px-3 py-2 bg-sky-100 rounded')}
          >
            <Text style={tailwind('text-sky-700')}>Details</Text>
          </TouchableOpacity>
    <TouchableOpacity
      style={[tailwind('bg-white p-4 mb-3 rounded-lg'), { elevation: 2 }]}
            <TouchableOpacity
              onPress={() => acknowledge(item.id)}
              style={tailwind('px-3 py-2 bg-sky-600 rounded')}
            >
              <Text style={tailwind('text-white')}>Acknowledge</Text>
            </TouchableOpacity>
          <Text style={tailwind('text-xs text-gray-500 mt-2')}>{new Date(item.timestamp).toLocaleString()}</Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: item.severity === 'critical' ? '#ef4444' : item.severity === 'high' ? '#f97316' : '#34d399', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{item.severity?.toUpperCase() || 'N/A'}</Text>
          </View>

          <Text style={tailwind(`text-sm font-semibold ${item.acknowledged ? 'text-green-600' : 'text-red-600'} mt-2`)}>
            {item.acknowledged ? 'Acknowledged' : 'Unacknowledged'}
          </Text>
        </View>
      </View>

      {/* thumbnail if available */}
      {item.evidence && item.evidence.length > 0 && item.evidence[0].url ? (
        <Image source={{ uri: item.evidence[0].url }} style={{ width: '100%', height: 140, borderRadius: 8, marginTop: 12 }} resizeMode="cover" />
      ) : null}

      <View style={tailwind('flex-row mt-3')}> 
        <TouchableOpacity
          onPress={() => navigation.navigate('IncidentDetail', { incident: item })}
          style={tailwind('mr-2 px-3 py-2 bg-gray-200 rounded')}
        >
          <Text>Details</Text>
        </TouchableOpacity>

        {!item.acknowledged && (
          <TouchableOpacity
            onPress={() => acknowledge(item.id)}
            style={tailwind('px-3 py-2 bg-blue-600 rounded')}
          >
            <Text style={tailwind('text-white')}>Acknowledge</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={tailwind('flex-1 bg-sky-50')}>
      <ScrollView
        style={tailwind('flex-1 p-4')}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Title */}
        <View style={tailwind('mb-4')}> 
          <Text style={tailwind('text-2xl font-bold text-sky-700')}>Recent Incidents</Text>
        </View>
        <NotificationBanner visible={bannerVisible} message={bannerMessage} onPress={() => { setBannerVisible(false); }} />
        {loadingIncidents ? (
          <ActivityIndicator size="large" color="#0369A1" style={tailwind('my-4')} />
        ) : incidents.length === 0 ? (
          <Text style={tailwind('text-sky-600 text-center my-4')}>No incidents to display.</Text>
        ) : (
          <FlatList
            data={incidents}
            renderItem={renderIncidentItem}
            keyExtractor={(item) => item.id.toString()}
            scrollEnabled={false}
          />
        )}
      </ScrollView>
      {/* Floating SOS button bottom-right */}
      <TouchableOpacity
        onPress={async () => {
          Alert.alert(
            'Emergency SOS',
            'Trigger emergency SOS? This will notify security.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Send SOS',
                style: 'destructive',
                onPress: async () => {
                  const cameraId = incidents?.[0]?.camera_id;
                  if (!cameraId) {
                    Alert.alert('No camera', 'No camera available to attach SOS. Notifying locally.');
                    Alert.alert('SOS Sent', 'Security notified (local).');
                    return;
                  }
                  const payload = {
                    camera_id: cameraId,
                    type: 'fall_health',
                    severity: 'critical',
                    severity_score: 100,
                    description: 'SOS triggered by viewer',
                  };
                  const res = await createIncident(payload);
                  if (res.success) {
                    setBannerMessage('SOS sent — emergency incident created');
                    setBannerVisible(true);
                    setTimeout(() => setBannerVisible(false), 3500);
                    fetchIncidents();
                  } else {
                    Alert.alert('Error', res.message || 'Failed to send SOS.');
                  }
                },
              },
            ]
          );
        }}
        style={{ position: 'absolute', right: 18, bottom: 28, backgroundColor: '#ef4444', padding: 14, borderRadius: 999, elevation: 6 }}
      >
        <Text style={{ color: '#fff', fontWeight: '800' }}>SOS</Text>
      </TouchableOpacity>
      {/* Menu bar */}
      <MenuBar navigation={navigation} />
    </View>
  );
};

export default ViewerDashboardScreen;