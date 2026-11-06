import { ComponentRef, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

export type TrendPoint = {
    candidatePassed: number;
    sourceFile: string;
    analyzedAt: number; // epoch ms
};

type Props = {
    data: TrendPoint[];
};

const HEIGHT = 220;
const PAD = { left: 36, right: 20, top: 20, bottom: 30 };
const STEP = 56;              // horizontal distance between points (px)
const MAX_POINTS = 30;        // show only the most recent entries
const SCREEN_MARGIN = 48;     // parent horizontal padding (24 + 24)
const GRID_FRACTIONS = [0, 0.5, 1];

export default function TrendChart({ data }: Props) {
    const { width: screenWidth } = useWindowDimensions();
    const [selected, setSelected] = useState<number | null>(null);
    const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

    if (data.length === 0) {
        return <Text style={styles.empty}>No saved results yet</Text>;
    }

    const points = data.slice(-MAX_POINTS);

    // Even y-max (minimum 2) so the half-way gridline label is always a whole number.
    const highest = Math.max(...points.map(p => p.candidatePassed), 1);
    const yMax = Math.max(2, Math.ceil(highest / 2) * 2);

    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const width = Math.max(
        screenWidth - SCREEN_MARGIN,
        PAD.left + PAD.right + (points.length - 1) * STEP,
    );

    const xAt = (index: number) => PAD.left + index * STEP;
    const yAt = (value: number) => PAD.top + (1 - value / yMax) * plotHeight;

    const selectedPoint =
        selected !== null && selected < points.length ? points[selected] : null;

    return (
        <View>
            <View style={styles.readout}>
                {selectedPoint ? (
                    <>
                        <Text style={styles.readoutMain}>
                            {selectedPoint.candidatePassed}{' '}
                            {selectedPoint.candidatePassed === 1 ? 'event' : 'events'}
                        </Text>
                        <Text style={styles.readoutSub}>
                            {new Date(selectedPoint.analyzedAt).toLocaleString()} ·{' '}
                            {selectedPoint.sourceFile}
                        </Text>
                    </>
                ) : (
                    <Text style={styles.readoutSub}>Tap a point to see its count</Text>
                )}
            </View>

            <ScrollView
                horizontal
                ref={scrollRef}
                showsHorizontalScrollIndicator={false}
                onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
                <Svg width={width} height={HEIGHT}>
                    {/* gridlines + y-axis labels */}
                    {GRID_FRACTIONS.map(f => (
                        <Line
                            key={`grid-${f}`}
                            x1={PAD.left}
                            x2={width - PAD.right}
                            y1={yAt(f * yMax)}
                            y2={yAt(f * yMax)}
                            stroke="#e5e7eb"
                            strokeWidth={1}
                        />
                    ))}
                    {GRID_FRACTIONS.map(f => (
                        <SvgText
                            key={`ylabel-${f}`}
                            x={PAD.left - 6}
                            y={yAt(f * yMax) + 4}
                            fontSize={10}
                            fill="#667085"
                            textAnchor="end"
                        >
                            {Math.round(f * yMax)}
                        </SvgText>
                    ))}

                    {/* connecting line */}
                    <Polyline
                        points={points.map((p, i) => `${xAt(i)},${yAt(p.candidatePassed)}`).join(' ')}
                        fill="none"
                        stroke="#4f46e5"
                        strokeWidth={2}
                    />

                    {/* visible points */}
                    {points.map((p, i) => (
                        <Circle
                            key={`point-${i}`}
                            cx={xAt(i)}
                            cy={yAt(p.candidatePassed)}
                            r={selected === i ? 7 : 5}
                            fill={selected === i ? '#dc2626' : '#4f46e5'}
                        />
                    ))}

                    {/* larger invisible circles on top = easy tap targets */}
                    {points.map((p, i) => (
                        <Circle
                            key={`hit-${i}`}
                            cx={xAt(i)}
                            cy={yAt(p.candidatePassed)}
                            r={16}
                            fill="transparent"
                            onPress={() => setSelected(i)}
                        />
                    ))}

                    {/* x-axis date labels (day/month) */}
                    {points.map((p, i) => {
                        const d = new Date(p.analyzedAt);
                        return (
                            <SvgText
                                key={`xlabel-${i}`}
                                x={xAt(i)}
                                y={HEIGHT - 8}
                                fontSize={10}
                                fill="#667085"
                                textAnchor="middle"
                            >
                                {`${d.getDate()}/${d.getMonth() + 1}`}
                            </SvgText>
                        );
                    })}
                </Svg>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    empty: {
        color: '#667085',
        textAlign: 'center',
        paddingVertical: 24,
    },
    readout: {
        minHeight: 44,
        justifyContent: 'center',
        marginBottom: 8,
    },
    readoutMain: {
        color: '#172033',
        fontSize: 18,
        fontWeight: '600',
    },
    readoutSub: {
        color: '#667085',
        fontSize: 13,
    },
});
