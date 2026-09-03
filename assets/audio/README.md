# Listening audio

Drop MP3 recordings here. A listening question uses its file when the JSON
includes "audio": "assets/audio/<name>.mp3". If the file is missing (or not
recorded yet), the app automatically reads the question's transcript with the
browser's speech synthesis instead — nothing breaks.

Naming convention used elsewhere: <mock>_<skill>_p<part>_q<n>.mp3
Example: m1_listening_p1_q1.mp3
