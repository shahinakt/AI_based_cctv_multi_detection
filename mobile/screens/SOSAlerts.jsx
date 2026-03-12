// screens/SOSAlerts.jsx
// Admin-only screen: manage active and historic SOS alerts.
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StatusBar,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  listSosAlerts,
  listActiveSosAlerts,
  handleSosAlert,
  getSosStats,
} from '../services/api';

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------
function StatusBadge({ status }) {
  const isActive = status === 'active';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: isActive ? '#FEF2F2' : '#ECFDF5',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: isActive ? '#FCA5A5' : '#6EE7B7',
        alignSelf: 'flex-start',
      }}
    >
      <Ionicons
        name={isActive ? 'warning' : 'checkmark-circle'}
        size={13}
        color={isActive ? '#DC2626' : '#059669'}
        style={{ marginRight: 4 }}
      />
      <Text style={{ color: isActive ? '#DC2626' : '#059669', fontWeight: '700', fontSize: 12 }}>
        {isActive ? 'Active' : 'Handled'}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// SOS Alert Card
// ---------------------------------------------------------------------------
function SosCard({ alert, onHandle, navigation }) {
  const [resolving, setResolving] = useState(false);
  // Cross-platform replacement for Alert.prompt (which is iOS-only)
  const [showModal, setShowModal] = useState(false);
  const [resolveNote, setResolveNote] = useState('');

  const handlePress = () => {
    if (alert.alert_status === 'handled') return;
    setResolveNote('');
    setShowModal(true);
  };

  const confirmHandle = async () => {
    setShowModal(false);
    setResolving(true);
    try {
      await onHandle(alert.id, resolveNote.trim());
    } finally {
      setResolving(false);
    }
  };

  const triggeredAt = alert.triggered_at
    ? new Date(alert.triggered_at).toLocaleString()
    : '—';

  const handledAt = alert.handled_at
    ? new Date(alert.handled_at).toLocaleString()
    : null;

  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        marginBottom: 14,
        borderLeftWidth: 4,
        borderLeftColor: alert.alert_status === 'active' ? '#EF4444' : '#10B981',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
        elevation: 3,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ color: '#1F2937', fontWeight: '800', fontSize: 16 }}>
            🚨 SOS Alert #{alert.id}
          </Text>
          <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
            Incident #{alert.incident_id}
          </Text>
        </View>
        <StatusBadge status={alert.alert_status} />
      </View>

      {/* Message */}
      {alert.alert_message && (
        <Text style={{ color: '#374151', fontSize: 13, marginBottom: 12, lineHeight: 18 }}>
          {alert.alert_message}
        </Text>
      )}

      {/* Timestamps */}
      <View style={{ marginBottom: 12 }}>
        <Text style={{ color: '#9CA3AF', fontSize: 12 }}>
          🕐 Triggered: <Text style={{ color: '#6B7280' }}>{triggeredAt}</Text>
        </Text>
        {handledAt && (
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>
            ✅ Handled: <Text style={{ color: '#6B7280' }}>{handledAt}</Text>
          </Text>
        )}
        {alert.handled_by_admin && (
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4 }}>
            👤 By Admin ID: <Text style={{ color: '#6B7280' }}>#{alert.handled_by_admin}</Text>
          </Text>
        )}
      </View>

      {/* Action buttons */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: '#F3F4F6',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
          }}
          onPress={() => navigation.navigate('IncidentDetail', {
            incident: { id: alert.incident_id },
          })}
        >
          <Text style={{ color: '#4F46E5', fontWeight: '600', fontSize: 13 }}>
            View Incident
          </Text>
        </TouchableOpacity>

        {alert.alert_status === 'active' && (
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: resolving ? '#E5E7EB' : '#DC2626',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
            onPress={handlePress}
            disabled={resolving}
          >
            {resolving ? (
              <ActivityIndicator size="small" color="#DC2626" />
            ) : (
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                Mark Handled
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Cross-platform resolution modal (replaces iOS-only Alert.prompt) */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              padding: 24,
              width: '85%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 10,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937', marginBottom: 6 }}>
              🚨 Resolve SOS Alert #{alert.id}
            </Text>
            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
              Add a resolution note (optional):
            </Text>
            <TextInput
              value={resolveNote}
              onChangeText={setResolveNote}
              placeholder="e.g. False alarm, situation resolved..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              style={{
                borderWidth: 1,
                borderColor: '#D1D5DB',
                borderRadius: 10,
                padding: 12,
                fontSize: 14,
                color: '#1F2937',
                backgroundColor: '#F9FAFB',
                minHeight: 70,
                textAlignVertical: 'top',
                marginBottom: 20,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#D1D5DB',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#6B7280', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmHandle}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 10,
                  backgroundColor: '#DC2626',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Mark Handled</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------
export default function SOSAlertsScreen({ navigation }) {
  const tailwind = useTailwind();
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, handled: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('active'); // 'active' | 'all' | 'handled'
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setError('');
    try {
      const [alertRes, statsRes] = await Promise.all([
        listSosAlerts({ alertStatus: filter === 'all' ? undefined : filter }),
        getSosStats(),
      ]);

      if (alertRes.success) setAlerts(alertRes.data);
      else setError(alertRes.message);

      if (statsRes.success) setStats(statsRes.data);
    } catch (e) {
      setError('Failed to load SOS data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [filter]);

  // Auto-refresh every 15 s while screen is visible
  useEffect(() => {
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleHandle = async (sosId, note) => {
    // Optimistic update – hide the Mark Handled button instantly and show Handled badge
    setAlerts(prev =>
      prev.map(a =>
        a.id === sosId
          ? { ...a, alert_status: 'handled', handled_at: new Date().toISOString() }
          : a,
      ),
    );

    const res = await handleSosAlert(sosId, note);
    if (res.success) {
      Alert.alert('✅ Resolved', 'SOS alert marked as handled.');
      loadData(); // sync with server to get latest stats
    } else {
      // Roll back optimistic update on error
      setAlerts(prev =>
        prev.map(a =>
          a.id === sosId ? { ...a, alert_status: 'active', handled_at: null } : a,
        ),
      );
      Alert.alert('Error', res.message);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 20,
          paddingTop: 56,
          paddingBottom: 16,
          backgroundColor: '#4F46E5',
          borderBottomWidth: 0,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 14 }}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>
            🚨 SOS Alerts
          </Text>
          <Text style={{ color: '#C7D2FE', fontSize: 13, marginTop: 2 }}>
            Admin Emergency Alert Management
          </Text>
        </View>
        {stats.active > 0 && (
          <View
            style={{
              backgroundColor: '#DC2626',
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
              {stats.active}
            </Text>
          </View>
        )}
      </View>

      {/* Stats bar */}
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: '#FFFFFF',
          paddingHorizontal: 20,
          paddingVertical: 16,
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#E5E7EB',
        }}
      >
        {[
          { label: 'Total', value: stats.total, color: '#4F46E5' },
          { label: 'Active', value: stats.active, color: '#DC2626' },
          { label: 'Handled', value: stats.handled, color: '#059669' },
        ].map((s) => (
          <View
            key={s.label}
            style={{
              flex: 1,
              backgroundColor: '#F9FAFB',
              borderRadius: 12,
              padding: 12,
              alignItems: 'center',
              borderWidth: 1,
              borderColor: '#E5E7EB',
            }}
          >
            <Text style={{ color: s.color, fontSize: 22, fontWeight: '800' }}>{s.value}</Text>
            <Text style={{ color: '#6B7280', fontSize: 11 }}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* Filter tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 8, backgroundColor: '#FFFFFF' }}>
        {['active', 'all', 'handled'].map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: filter === f ? '#4F46E5' : '#F3F4F6',
              borderWidth: 1,
              borderColor: filter === f ? '#4F46E5' : '#E5E7EB',
            }}
          >
            <Text style={{ color: filter === f ? '#fff' : '#6B7280', fontWeight: '600', fontSize: 13, textTransform: 'capitalize' }}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={{ color: '#9CA3AF', marginTop: 12 }}>Loading SOS alerts…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
          }
        >
          {error ? (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 16, marginVertical: 8, borderWidth: 1, borderColor: '#FCA5A5' }}>
              <Text style={{ color: '#DC2626' }}>{error}</Text>
            </View>
          ) : alerts.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Ionicons name="checkmark-circle" size={64} color="#059669" />
              <Text style={{ color: '#1F2937', fontSize: 16, marginTop: 16, fontWeight: '700' }}>
                {filter === 'active' ? 'No active SOS alerts' : 'No SOS alerts found'}
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 13, marginTop: 8, textAlign: 'center' }}>
                {filter === 'active'
                  ? 'All high-priority incidents are being acknowledged on time.'
                  : 'No SOS alerts match the selected filter.'}
              </Text>
            </View>
          ) : (
            alerts.map((alert) => (
              <SosCard
                key={alert.id}
                alert={alert}
                onHandle={handleHandle}
                navigation={navigation}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
