import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { getMyEvidence, verifyEvidence, getDebugInfo } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function EvidenceStore({ navigation }) {
  const tailwind = useTailwind();
  const [evidence, setEvidence] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');

  useEffect(() => { 
    initBaseUrl();
    fetch(); 
  }, []);

  const initBaseUrl = async () => {
    const debugInfo = getDebugInfo();
    const url = debugInfo.BASE_URL || 'http://localhost:8000';
    setBaseUrl(url);
    console.log('[EvidenceStore] Using BASE_URL:', url);
  };

  const fetch = async () => {
    setLoading(true);
    const res = await getMyEvidence();
    setLoading(false);
    
    if (res.success) {
      console.log('[EvidenceStore] Received evidence:', res.data?.length || 0);
      setEvidence(res.data || []);
    } else {
      Alert.alert('Error', res.message || 'Failed to load evidence');
      // If unauthorized, might need to re-login
      if (res.status === 401) {
        Alert.alert(
          'Session Expired',
          'Please login again to view evidence.',
          [{ text: 'OK', onPress: () => navigation.navigate('ViewerLogin') }]
        );
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetch();
    setRefreshing(false);
  };

  const handleVerifyEvidence = async (evidenceId) => {
    Alert.alert(
      'Verify Evidence',
      'Verify this evidence on the blockchain?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Verify',
          onPress: async () => {
            const res = await verifyEvidence(evidenceId);
            if (res.success) {
              const status = res.data.status;
              const icon = status === 'VERIFIED' ? '✅' : '❌';
              Alert.alert(
                `${icon} ${status}`,
                res.data.message,
                [{ text: 'OK', onPress: () => fetch() }] // Refresh to get updated status
              );
            } else {
              Alert.alert('Verification Failed', res.message || 'Could not verify evidence');
            }
          }
        }
      ]
    );
  };

  const getImageUrl = (filePath) => {
    if (!filePath) return null;
    // Evidence is served at /evidence/{file_path}
    // file_path format: "camera_0/snapshot_123.jpg" or similar
    return `${baseUrl}/evidence/${filePath}`;
  };

  const getVerificationBadge = (item) => {
    if (!item.blockchain_tx_hash) {
      return { text: 'Not on Blockchain', color: 'bg-gray-400' };
    }
    
    switch (item.verification_status) {
      case 'VERIFIED':
        return { text: '✅ Verified', color: 'bg-green-500' };
      case 'TAMPERED':
        return { text: '❌ Tampered', color: 'bg-red-500' };
      case 'PENDING':
      default:
        return { text: '⏳ Pending', color: 'bg-yellow-500' };
    }
  };

  const renderItem = ({ item }) => {
    const imageUrl = getImageUrl(item.file_path);
    const badge = getVerificationBadge(item);
    const timestamp = new Date(item.created_at).toLocaleString();

    return (
      <TouchableOpacity
        style={tailwind('mb-4 bg-white rounded-lg p-3 border border-sky-100 shadow')}
        onLongPress={() => handleVerifyEvidence(item.id)}
      >
        {/* Header */}
        <View style={tailwind('flex-row justify-between items-center mb-2')}>
          <Text style={tailwind('font-semibold text-sky-800')}>
            Incident #{item.incident_id}
          </Text>
          <View style={tailwind(`px-2 py-1 rounded ${badge.color}`)}>
            <Text style={tailwind('text-xs text-white font-bold')}>{badge.text}</Text>
          </View>
        </View>

        {/* Image */}
        {imageUrl && (
          <Image 
            source={{ uri: imageUrl }} 
            style={{ width: '100%', height: 180, borderRadius: 8, backgroundColor: '#f0f0f0' }} 
            resizeMode="cover"
            onError={(e) => console.log('[EvidenceStore] Image load error:', e.nativeEvent.error)}
          />
        )}

        {/* Details */}
        <View style={tailwind('mt-2')}>
          <Text style={tailwind('text-xs text-gray-600')}>{timestamp}</Text>
          {item.blockchain_tx_hash && (
            <Text style={tailwind('text-xs text-sky-600 mt-1')} numberOfLines={1}>
              TX: {item.blockchain_tx_hash.substring(0, 20)}...
            </Text>
          )}
          {item.verified_at && (
            <Text style={tailwind('text-xs text-green-600 mt-1')}>
              Last verified: {new Date(item.verified_at).toLocaleString()}
            </Text>
          )}
        </View>

        {/* Verify button hint */}
        {item.blockchain_tx_hash && (
          <Text style={tailwind('text-xs text-gray-500 mt-2 text-center italic')}>
            Long press to verify on blockchain
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={tailwind('flex-1 bg-sky-50 justify-center items-center')}>
        <ActivityIndicator size="large" color="#0369a1" />
        <Text style={tailwind('mt-2 text-sky-700')}>Loading evidence...</Text>
      </View>
    );
  }

  return (
    <View style={tailwind('flex-1 bg-sky-50 p-4')}>
      <Text style={tailwind('text-2xl font-bold mb-4 text-sky-700')}>Evidence Store</Text>
      
      {evidence.length === 0 ? (
        <View style={tailwind('flex-1 justify-center items-center')}>
          <Text style={tailwind('text-sky-600 text-center')}>
            No evidence found.{'\n'}
            Evidence will appear here when incidents are detected.
          </Text>
        </View>
      ) : (
        <FlatList
          data={evidence}
          keyExtractor={(item) => `evidence-${item.id}`}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0369a1']} />
          }
        />
      )}
    </View>
  );
}
