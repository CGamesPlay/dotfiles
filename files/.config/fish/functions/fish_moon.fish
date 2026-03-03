function fish_moon -d 'Describe the current phase of the moon'
  if test (count $argv) -gt 0
    # Given date, use 12pm on that date
    if test (uname) = "Linux"
      set -f now (math (date -d $argv[1] +"%s") + 43200)
    else
      set -f now (math (date -j -f "%F %T" "$argv[1] 00:00:00" +"%s") + 43200)
    end
  else
    # Default: 12pm today
    if test (uname) = "Linux"
      set -f now (date -d "12:00 today" +%s)
    else
      set -f now (date -v 12H +%s)
    end
    # If before 6am, use yesterday instead
    if test (date +%H) -lt 6
      set -f now (math $now - 86400)
    end
  end

  # Delta in days until the next full moon
  set -f full_ts (__fish_next_full_moon $now)
  set -f delta (math "($full_ts - $now) / 86400")

  # Phase thresholds
  set -f synodic 29.530588861
  set -f half (math "$synodic / 2")
  set -f step (math "($half - 1) / 3")
  set -f t1 1
  set -f t2 (math "1 + $step")
  set -f t3 (math "1 + 2 * $step")
  set -f t4 $half
  set -f t5 (math "$half + 1")
  set -f t6 (math "$half + 1 + $step")
  set -f t7 (math "$half + 1 + 2 * $step")

  if test $delta -lt $t1
    echo "full"
  else if test $delta -lt $t2
    echo "waxing gibbous"
  else if test $delta -lt $t3
    echo "first quarter"
  else if test $delta -lt $t4
    echo "waxing crescent"
  else if test $delta -lt $t5
    echo "new"
  else if test $delta -lt $t6
    echo "waning crescent"
  else if test $delta -lt $t7
    echo "third quarter"
  else
    echo "waning gibbous"
  end
end

# date -r (printf '%.0f' (__fish_next_full_moon (date -j -f '%F' '2026-02-01' +%s))) '+%F %H:%M'
function __fish_next_full_moon -d "Return unix timestamp of the next full moon"
  set -f ts $argv[1]
  set -f rad 0.0174532925199433

  while true
    # Convert to Julian Date and decimal year
    set -f jd (math "$ts / 86400 + 2440587.5")
    set -f year (math "2000.0 + ($jd - 2451545.0) / 365.25")

    # Lunation number: half-integers correspond to full moons
    set -f k (math "floor(($year - 2000.0) * 12.3685) + 0.5")

    # Time parameter in Julian centuries from J2000.0
    set -f T (math "$k / 1236.85")
    set -f T2 (math "$T * $T")
    set -f T3 (math "$T2 * $T")
    set -f T4 (math "$T3 * $T")

    # Approximate Julian Ephemeris Day of the full moon
    set -f jde (math "2451550.09766 + 29.530588861 * $k + 0.00015437 * $T2 - 0.000000150 * $T3 + 0.00000000073 * $T4")

    # Eccentricity of Earth's orbit (Meeus Eq. 47.6)
    set -f E (math "1 - 0.002516 * $T - 0.0000074 * $T2")

    # Fundamental arguments (converted to radians)
    set -f M (math "(2.5534 + 29.10535670 * $k - 0.0000014 * $T2 - 0.00000011 * $T3) * $rad")
    set -f Mp (math "(201.5643 + 385.81693528 * $k + 0.0107582 * $T2 + 0.00001238 * $T3 - 0.000000058 * $T4) * $rad")
    set -f F (math "(160.7108 + 390.67050284 * $k - 0.0016118 * $T2 - 0.00000227 * $T3 + 0.000000011 * $T4) * $rad")
    set -f Om (math "(124.7746 - 1.56375588 * $k + 0.0020672 * $T2 + 0.00000215 * $T3) * $rad")

    # 25 correction terms for full moon phase (days)
    set -f corr (math "\
      -0.40614 * sin($Mp) \
      + 0.17302 * $E * sin($M) \
      + 0.01614 * sin(2 * $Mp) \
      + 0.01043 * sin(2 * $F) \
      + 0.00734 * $E * sin($Mp - $M) \
      - 0.00515 * $E * sin($Mp + $M) \
      + 0.00209 * $E * $E * sin(2 * $M) \
      - 0.00111 * sin($Mp - 2 * $F) \
      - 0.00057 * sin($Mp + 2 * $F) \
      + 0.00056 * $E * sin(2 * $Mp + $M) \
      - 0.00042 * sin(3 * $Mp) \
      + 0.00042 * $E * sin($M + 2 * $F) \
      + 0.00038 * $E * sin($M - 2 * $F) \
      - 0.00024 * $E * sin(2 * $Mp - $M) \
      - 0.00017 * sin($Om) \
      - 0.00007 * sin($Mp + 2 * $M) \
      + 0.00004 * sin(2 * $Mp - 2 * $F) \
      + 0.00004 * sin(3 * $M) \
      + 0.00003 * sin($Mp + $M - 2 * $F) \
      + 0.00003 * sin(2 * $Mp + 2 * $F) \
      - 0.00003 * sin($Mp + $M + 2 * $F) \
      + 0.00003 * sin($Mp - $M + 2 * $F) \
      - 0.00002 * sin($Mp - $M - 2 * $F) \
      - 0.00002 * sin(3 * $Mp + $M) \
      + 0.00002 * sin(4 * $Mp)")

    # 14 planetary perturbation corrections (A-terms, days)
    set -f a_corr (math "\
      0.000325 * sin((299.77 + 0.107408 * $k - 0.009173 * $T2) * $rad) \
      + 0.000165 * sin((251.88 + 0.016321 * $k) * $rad) \
      + 0.000164 * sin((251.83 + 26.651886 * $k) * $rad) \
      + 0.000126 * sin((349.42 + 36.412478 * $k) * $rad) \
      + 0.000110 * sin((84.66 + 18.206239 * $k) * $rad) \
      + 0.000062 * sin((141.74 + 53.303771 * $k) * $rad) \
      + 0.000060 * sin((207.14 + 2.453732 * $k) * $rad) \
      + 0.000056 * sin((154.84 + 7.306860 * $k) * $rad) \
      + 0.000047 * sin((34.52 + 27.261239 * $k) * $rad) \
      + 0.000042 * sin((207.19 + 0.121824 * $k) * $rad) \
      + 0.000040 * sin((291.34 + 1.844379 * $k) * $rad) \
      + 0.000037 * sin((161.72 + 24.198154 * $k) * $rad) \
      + 0.000035 * sin((239.56 + 25.513099 * $k) * $rad) \
      + 0.000023 * sin((331.55 + 3.592518 * $k) * $rad)")

    set -f jde_full (math "$jde + $corr + $a_corr")
    set -f result (math "($jde_full - 2440587.5) * 86400")

    # If the computed full moon is after the input, we're done
    if test $result -gt $ts
      echo $result
      return
    end

    # Otherwise advance one day and retry
    set -f ts (math "$ts + 86400")
  end
end
