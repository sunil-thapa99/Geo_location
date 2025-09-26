import librosa
import numpy as np
import matplotlib.pyplot as plt
import os
from pathlib import Path
from scipy.io import wavfile

PARENT_DIR = Path(__file__).resolve().parent
t11_a1_audio = os.path.join(PARENT_DIR, 't11_a1_2025-09-24_16_51 (online-audio-converter.com).wav')


y, sr = librosa.load(t11_a1_audio, sr=None) 
fft_data = np.fft.fft(y)
 
S = librosa.stft(y)
# Convert the amplitude spectrogram to dB-scaled spectrogram
S_dB = librosa.amplitude_to_db(np.abs(S), ref=np.max)
 
plt.figure(figsize=(10, 4))
librosa.display.specshow(S_dB, sr=sr, x_axis='time', y_axis='log')
plt.colorbar(format='%+2.0f dB', label='Amplitude (dB)')
plt.title('Spectrogram')
plt.tight_layout()

 
plt.show()

 