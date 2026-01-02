import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import { useTailwind } from 'tailwind-rn';

const PrimaryButton = ({ title, onPress, disabled = false, loading = false, style }) => {
	const tailwind = useTailwind();
	return (
		<TouchableOpacity
			onPress={onPress}
			disabled={disabled || loading}
			style={[
				tailwind('w-full py-4 rounded-lg items-center justify-center'),
				{ backgroundColor: disabled ? '#9fb2ea' : '#2563eb' },
				style,
			]}
			activeOpacity={0.85}
		>
			{loading ? (
				<ActivityIndicator size="small" color="#fff" />
			) : (
				<Text style={tailwind('text-white font-bold text-lg text-center')}>{title}</Text>
			)}
		</TouchableOpacity>
	);
};

export default PrimaryButton;
