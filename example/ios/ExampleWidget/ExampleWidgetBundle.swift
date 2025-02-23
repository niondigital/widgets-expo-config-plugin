//
//  ExampleWidgetBundle.swift
//  ExampleWidget
//
//  Created by Sebastian Weyrauch on 23.02.25.
//

import WidgetKit
import SwiftUI

@main
struct ExampleWidgetBundle: WidgetBundle {
    var body: some Widget {
        ExampleWidget()
        ExampleWidgetControl()
        ExampleWidgetLiveActivity()
    }
}
