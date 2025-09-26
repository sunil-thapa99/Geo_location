import librosa
import numpy as np
import matplotlib.pyplot as plt

 
t11_a1_audio = "t11_a1_2025-09-24_16_51 (online-audio-converter.com).wav"
y, sr = librosa.load(t11_a1_audio, sr=None) 

 
S = librosa.stft(y)
# Convert the amplitude spectrogram to dB-scaled spectrogram
S_dB = librosa.amplitude_to_db(np.abs(S), ref=np.max)

 
plt.figure(figsize=(10, 4))
librosa.display.specshow(S_dB, sr=sr, x_axis='time', y_axis='log')
plt.colorbar(format='%+2.0f dB')
plt.title('Spectrogram')
plt.tight_layout()

 
plt.show()