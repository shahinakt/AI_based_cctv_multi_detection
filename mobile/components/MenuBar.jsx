import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { useTailwind } from 'tailwind-rn';

export default function MenuBar({ navigation }) {
  const tailwind = useTailwind();

  return (
    <View style={tailwind('flex-row bg-sky-700 p-2 justify-around')}> 
      <TouchableOpacity onPress={() => navigation.navigate('ViewerDashboard')}>
        <Text style={tailwind('text-center text-sm text-white')}>Home</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('IncidentList')}>
        <Text style={tailwind('text-center text-sm text-white')}>Incidents</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('EvidenceStore')}>
        <Text style={tailwind('text-center text-sm text-white')}>Evidence</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Acknowledgement')}>
        <Text style={tailwind('text-center text-sm text-white')}>Acknowledge</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
        <Text style={tailwind('text-center text-sm text-white')}>Profile</Text>
      </TouchableOpacity>
    </View>
  );
}
