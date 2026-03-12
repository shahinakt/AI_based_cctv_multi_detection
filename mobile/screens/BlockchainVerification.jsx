// screens/BlockchainVerification.jsx
// Full blockchain evidence integrity screen for admin verification + user status display.
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
} from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getBlockchainStatus,
  adminVerifyBlockchain,
} from '../services/api';

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG = {
  Pending:  { color: '#D97706', icon: 'time-outline',          label: 'Pending Verification' },
  Verified: { color: '#059669', icon: 'checkmark-circle',      label: 'Verified'             },
  Rejected: { color: '#DC2626', icon: 'close-circle',          label: 'Rejected / Tampered'  },
  Unknown:  { color: '#6B7280', icon: 'help-circle-outline',   label: 'No Record'            },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Unknown;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: cfg.color + '18',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 6,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: cfg.color + '60',
        marginTop: 4,
      }}
    >
      <Ionicons name={cfg.icon} size={16} color={cfg.color} style={{ marginRight: 6 }} />
      <Text style={{ color: cfg.color, fontWeight: '700', fontSize: 13 }}>
        {cfg.label}
      </Text>
    </View>
  );
}

function SectionCard({ title, children }) {
  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 18,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 3,
      }}
    >
      {title && (
        <Text style={{ color: '#6B7280', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 12, textTransform: 'uppercase' }}>
          {title}
        </Text>
      )}
      {children}
    </View>
  );
}

function HashRow({ label, value }) {
  if (!value) return null;
  const short = value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-12)}` : value;
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: '#6B7280', fontSize: 11, marginBottom: 2 }}>{label}</Text>
      <Text style={{ color: '#1F2937', fontSize: 12, fontFamily: 'monospace', letterSpacing: 0.5 }}>
        {short}
      </Text>
    </View>
  );
}

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
      <Text style={{ color: '#6B7280', fontSize: 13 }}>{label}</Text>
      <Text style={{ color: '#1F2937', fontSize: 13, fontWeight: '600', maxWidth: '60%', textAlign: 'right' }}>
        {String(value)}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const BlockchainVerificationScreen = ({ route, navigation }) => {
  const tailwind = useTailwind();
  const { incident } = route.params || {};
  const incidentId = incident?.id;

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [error, setError] = useState(null);

  // Load user role from stored user profile
  useEffect(() => {
    AsyncStorage.getItem('user')
      .then(raw => {
        if (raw) {
          try { setUserRole(JSON.parse(raw).role || null); } catch (_) {}
        }
      })
      .catch(() => {});
  }, []);

  const fetchStatus = useCallback(async (silent = false) => {
    if (!incidentId) {
      setError('No incident ID provided.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    setError(null);

    const result = await getBlockchainStatus(incidentId);
    if (result.success) {
      setRecord(result.data);
    } else {
      if (result.message && result.message.includes('No blockchain record')) {
        setRecord(null); // No record yet – not an error worth showing
      } else {
        setError(result.message || 'Failed to load blockchain status.');
      }
    }
    if (!silent) setLoading(false);
  }, [incidentId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStatus(true);
    setRefreshing(false);
  };

  // Admin: trigger verification
  const handleVerify = async () => {
    Alert.alert(
      'Verify Blockchain Integrity',
      'This will recalculate the SHA-256 hash of the evidence file and compare it with the stored record.\n\nProceed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify',
          style: 'default',
          onPress: async () => {
            setVerifying(true);
            const result = await adminVerifyBlockchain(incidentId);
            setVerifying(false);

            if (result.success) {
              const statusLabel = result.data?.status || result.data?.verification_status || 'Unknown';
              const isVerified  = statusLabel === 'Verified';
              Alert.alert(
                isVerified ? '✅ Evidence Verified' : '❌ Evidence Rejected',
                result.message || `Verification status: ${statusLabel}`,
                [{ text: 'OK' }]
              );
              fetchStatus(true);
            } else {
              Alert.alert('Verification Failed', result.message || 'Could not complete verification.');
            }
          },
        },
      ]
    );
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const currentStatus = record?.verification_status || 'Unknown';
  const statusCfg = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.Unknown;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F9FAFB', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text style={{ color: '#9CA3AF', marginTop: 12 }}>Loading blockchain record…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16, backgroundColor: '#4F46E5' }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 14 }}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Ionicons name="shield-checkmark-outline" size={22} color="#C7D2FE" style={{ marginRight: 10 }} />
        <View>
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '800' }}>
            Blockchain Integrity
          </Text>
          <Text style={{ color: '#C7D2FE', fontSize: 12 }}>
            Incident #{incidentId}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />}
      >
        {error && (
          <View style={{ backgroundColor: '#FEF2F2', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FCA5A5' }}>
            <Text style={{ color: '#DC2626', fontWeight: '600' }}>{error}</Text>
          </View>
        )}

        {/* Status Card */}
        <SectionCard title="Evidence Integrity Status">
          <InfoRow label="Incident ID" value={`#${incidentId}`} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ color: '#94A3B8', fontSize: 13 }}>Blockchain Status</Text>
            <StatusBadge status={currentStatus} />
          </View>
          {record?.verification_date && (
            <InfoRow
              label="Verified On"
              value={new Date(record.verification_date).toLocaleString()}
            />
          )}
          {record?.verified_by_admin && (
            <InfoRow label="Verified By (Admin ID)" value={record.verified_by_admin} />
          )}
          {!record && (
            <View style={{ marginTop: 8, padding: 12, backgroundColor: '#F3F4F6', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' }}>
              <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center' }}>
                No blockchain record found for this incident yet.{'\n'}
                A record is created automatically when evidence is generated.
              </Text>
            </View>
          )}
        </SectionCard>

        {/* Hash Details */}
        {record && (
          <SectionCard title="Cryptographic Hashes">
            <HashRow label="Evidence Hash (SHA-256)" value={record.evidence_hash} />
            <HashRow label="Blockchain Hash" value={record.blockchain_hash} />
            <InfoRow label="Evidence Path" value={record.evidence_path?.split(/[\\/]/).slice(-2).join('/')} />
            <InfoRow
              label="Record Created"
              value={record.created_at ? new Date(record.created_at).toLocaleString() : 'N/A'}
            />
          </SectionCard>
        )}

        {/* What does each status mean? */}
        <SectionCard title="Status Guide">
          {Object.entries(STATUS_CONFIG).filter(([k]) => k !== 'Unknown').map(([k, cfg]) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
              <Ionicons name={cfg.icon} size={18} color={cfg.color} style={{ marginRight: 10, marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: cfg.color, fontWeight: '700', fontSize: 13 }}>{cfg.label}</Text>
                <Text style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                  {k === 'Pending'  && 'Evidence has been captured and hashed. Awaiting admin review.'}
                  {k === 'Verified' && 'Admin confirmed that the evidence file has not been modified.'}
                  {k === 'Rejected' && 'Evidence file hash does not match stored record – possible tampering.'}
                </Text>
              </View>
            </View>
          ))}
        </SectionCard>

        {/* Admin: Verify button */}
        {userRole === 'admin' && record && (
          <TouchableOpacity
            onPress={handleVerify}
            disabled={verifying}
            style={{
              backgroundColor: verifying ? '#374151' : '#4F46E5',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              flexDirection: 'row',
              justifyContent: 'center',
              marginBottom: 24,
              shadowColor: '#4F46E5',
              shadowOpacity: 0.4,
              shadowRadius: 8,
              elevation: 5,
            }}
          >
            {verifying ? (
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 10 }} />
            ) : (
              <Ionicons name="shield-checkmark" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
            )}
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 16 }}>
              {verifying ? 'Verifying…' : 'Verify Blockchain Integrity'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Admin: no record available note */}
        {userRole === 'admin' && !record && (
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#E5E7EB' }}>
            <Text style={{ color: '#6B7280', textAlign: 'center', fontSize: 13 }}>
              Blockchain record is automatically created when the AI system generates evidence for an incident. No manual action required.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default BlockchainVerificationScreen;
