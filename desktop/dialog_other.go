//go:build !windows

package main

import "fmt"

func showError(message string) { fmt.Println(message) }
