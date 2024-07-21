function fish_moon -d 'Describe the current phase of the moon'
  if test (count $argv) -gt 0
    # Given date, test at 10am on that date
    if test (uname) = "Linux"
      set -f now (math (date -d $argv[1] +"%s") + 36000)
    else
      set -f now (math (date -j -f "%F %T" "$argv[1] 00:00:00" +"%s") + 36000)
    end
  else
    # Default, use 10am today
    if test (uname) = "Linux"
      set -f now (date -d "10:00 today" +%s)
    else
      set -f now (date -v 10H +%s)
    end
    # If before 4am, use yesterday's date instead
    if test (date +%H) -lt 4
      set -f now (math $now - 86400)
    end
  end

  # Calculate the phase now and tomorrow.
  set -f phase (__fish_moon_phase $now)
  set -f phase_tomorrow (__fish_moon_phase (math $now + 86400))

  # Announce quarters if tomorrow crosses the quarter boundary
  if test $phase -lt $phase_tomorrow
    echo "full"
  else if test $phase -lt 90
    echo "waxing gibbous"
  else if test $phase -gt 90 -a $phase_tomorrow -lt 90
    echo "first quarter"
  else if test $phase -lt 180
    echo "waxing crescent"
  else if test $phase -gt 180 -a $phase_tomorrow -lt 180
    echo "new"
  else if test $phase -lt 270
    echo "waning crescent"
  else if test $phase -gt 270 -a $phase_tomorrow -lt 270
    echo "third quarter"
  else
    echo "waning gibbous"
  end
end

function __fish_moon_phase -d "Convert unix timestamp to phase of moon"
  # Convert Unix time to Julian Date
  set -f jd (math "2440587.5 + $argv[1] / 86400")

  # Meeus/Jones/Butcher (MJB) model constants
  set -f T (math "($jd - 2451545) / 36525")
  set -f T2 (math "$T * $T")
  set -f T3 (math "$T2 * $T")
  set -f T4 (math "$T3 * $T")

  # Mean elongation of the Moon
  set -f D (math "297.8501921 + 445267.1114034 * $T - 0.0018819 * $T2 + $T3 / 545868 - $T4 / 113065000")

  # Sun's mean anomaly
  set -f M (math "357.5291092 + 35999.0502909 * $T - 0.0001536 * $T2 + $T3 / 24490000")

  # Moon's mean anomaly
  set -f Mprime (math "134.9633964 + 477198.8675055 * $T + 0.0087414 * $T2 + $T3 / 69699 - $T4 / 14712000")

  # Phase angle
  set -f i (math "180 - $D - 6.289 * sin($Mprime) + 2.100 * sin($M) - 1.274 * sin(2 * $D - $Mprime) - 0.658 * sin(2 * $D) - 0.214 * sin(2 * $Mprime) - 0.110 * sin($D)")

  # Normalize phase angle to [0, 360)
  set -f phase (math "$i - 360 * floor($i / 360)")

  echo $phase
end
