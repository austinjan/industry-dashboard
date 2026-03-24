package worker

import "context"

type FakeDataSource struct {
	gen       *Generator
	registers []RegisterConfig
	tick      int
}

func NewFakeDataSource(registers []RegisterConfig) *FakeDataSource {
	return &FakeDataSource{
		gen:       NewGenerator(),
		registers: registers,
	}
}

func (f *FakeDataSource) Read(ctx context.Context) (*ReadResult, error) {
	result := &ReadResult{
		Values:  make(map[string]float64),
		Strings: make(map[string]string),
	}
	for _, reg := range f.registers {
		if reg.DataType == "string" {
			continue
		}
		if reg.Fake == nil {
			continue
		}
		result.Values[reg.Name] = f.gen.GenerateFor(reg.Name, reg.Fake.Pattern, reg.Fake.Min, reg.Fake.Max, f.tick)
	}
	f.tick++
	return result, nil
}

func (f *FakeDataSource) Close() error {
	return nil
}
