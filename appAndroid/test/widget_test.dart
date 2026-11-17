import 'package:flutter_test/flutter_test.dart';
import 'package:app_android/main.dart';

void main() {
  testWidgets('Carga inicial de trIAje Movil', (WidgetTester tester) async {
    await tester.pumpWidget(const TriajeDoctorApp());
    expect(find.byType(TriajeDoctorApp), findsOneWidget);
  });
}
