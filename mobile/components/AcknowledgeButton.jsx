// components/AcknowledgeButton.jsx
import React, { useState } from 'react';
import { TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native';
import { useTailwind } from 'tailwind-rn';
import { acknowledgeIncident } from '../services/api';

const AcknowledgeButton = ({ incidentId, onAcknowledgeSuccess }) => {
  const tailwind = useTailwind();
  const [loading, setLoading] = useState(false);

  const handleAcknowledge = async () => {
    setLoading(true);
    try {
      const response = await acknowledgeIncident(incidentId);
      if (response.success) {
        Alert.alert('Success', 'Incident acknowledged successfully.');
        if (onAcknowledgeSuccess) {
          onAcknowledgeSuccess();
        }
      } else {
        Alert.alert('Error', response.message || 'Failed to acknowledge incident.');
      }
    } catch (error) {
      console.error('Error acknowledging incident:', error);
      Alert.alert('Error', 'An error occurred while acknowledging the incident.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleAcknowledge}
      style={tailwind('bg-blue-500 py-3 px-6 rounded-lg flex-row items-center justify-center')}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={tailwind('text-white font-bold text-lg')}>Acknowledge Incident</Text>
      )}
    </TouchableOpacity>
  );
};

export default AcknowledgeButton;